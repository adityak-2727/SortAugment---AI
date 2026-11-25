"""
Phase 3 Tests: Live Generation, validation, queue behavior, cancellation, and make_mask.
"""
import io
import time
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.ml.generator import make_mask, gpu_info
from app.services.jobs import job_manager


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def sample_image_bytes():
    buf = io.BytesIO()
    Image.new("RGB", (224, 224), color=(180, 210, 160)).save(buf, format="JPEG")
    return buf.getvalue()


class TestMaskGeneration:
    def test_make_mask_dimensions_and_type(self):
        mask = make_mask(300, 200, seed=42)
        assert isinstance(mask, Image.Image)
        assert mask.size == (300, 200)

    def test_make_mask_reproducible(self):
        m1 = make_mask(100, 100, seed=123)
        m2 = make_mask(100, 100, seed=123)
        assert m1.tobytes() == m2.tobytes()

    def test_make_mask_different_seeds(self):
        m1 = make_mask(100, 100, seed=1)
        m2 = make_mask(100, 100, seed=2)
        assert m1.tobytes() != m2.tobytes()


class TestGenerateValidation:
    def test_generate_invalid_axis(self, client, sample_image_bytes):
        files = [("files", ("test.jpg", sample_image_bytes, "image/jpeg"))]
        data = {"axis": "invalid_axis", "strength": "0.4", "variants_per_image": "1"}
        resp = client.post("/api/generate", data=data, files=files)
        # If GPU unavailable, might return 503; if GPU available, returns 400 for bad axis
        assert resp.status_code in {400, 503}
        err = resp.json()["error"]
        assert err["code"] in {"unknown_axis", "gpu_unavailable"}

    def test_generate_strength_out_of_bounds(self, client, sample_image_bytes):
        if not gpu_info()["available"]:
            pytest.skip("GPU not available")

        # Test < 0.3
        files = [("files", ("test.jpg", sample_image_bytes, "image/jpeg"))]
        data = {"axis": "lighting", "strength": "0.2", "variants_per_image": "1"}
        resp = client.post("/api/generate", data=data, files=files)
        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "invalid_strength"

        # Test > 0.7
        data["strength"] = "0.8"
        resp = client.post("/api/generate", data=data, files=files)
        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "invalid_strength"

    def test_generate_variants_out_of_bounds(self, client, sample_image_bytes):
        if not gpu_info()["available"]:
            pytest.skip("GPU not available")

        # Test > 3
        files = [("files", ("test.jpg", sample_image_bytes, "image/jpeg"))]
        data = {"axis": "lighting", "strength": "0.4", "variants_per_image": "4"}
        resp = client.post("/api/generate", data=data, files=files)
        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "invalid_variants"


class TestGenerateQueueLifecycle:
    def test_mock_generate_job_lifecycle(self, client, monkeypatch, sample_image_bytes):
        """
        Tests the generate queue execution, progress, and result formatting
        without downloading full SDXL weights in unit tests.
        """
        # Mock generator_manager.generate
        def mock_generate(src_image, mode, prompt, strength, seed, **kwargs):
            out = src_image.copy()
            return out, "sdxl"

        from app.ml.generator import generator_manager
        monkeypatch.setattr(generator_manager, "generate", mock_generate)

        # Mock gpu_info to simulate GPU available
        monkeypatch.setattr("app.routes.generate.gpu_info", lambda: {"available": True, "name": "Mock GPU", "vram_gb": 8.0})

        files = [("files", ("paper.jpg", sample_image_bytes, "image/jpeg"))]
        data = {
            "axis": "lighting",
            "strength": "0.4",
            "variants_per_image": "2",
            "seed": "999",
            "labels": '{"paper.jpg": "paper"}',
        }

        resp = client.post("/api/generate", data=data, files=files)
        assert resp.status_code == 202
        job_id = resp.json()["job_id"]

        # Poll until done
        for _ in range(50):
            detail = client.get(f"/api/jobs/{job_id}").json()
            if detail["status"] == "done":
                break
            time.sleep(0.1)
        else:
            pytest.fail(f"Generate job {job_id} did not finish")

        assert detail["status"] == "done"
        assert detail["type"] == "generate"
        assert detail["result"] is not None

        # Verify variants have 'mode' as required by contract
        src = detail["result"]["sources"][0]
        assert len(src["variants"]) == 2
        for v in src["variants"]:
            assert "mode" in v
            assert v["mode"] in {"img2img", "inpaint"}
            assert v["url"].startswith("/files/")
