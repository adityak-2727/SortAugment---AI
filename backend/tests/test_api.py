"""
Phase 2 Contract Tests: Asserts the exact contract response keys, types, and values
for every endpoint defined in CONTRACT.md.
"""
import io
import time
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.config import CLASS_NAMES, EFFECTS_BY_AXIS, ALL_EFFECT_IDS


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def sample_image_bytes():
    buf = io.BytesIO()
    im = Image.new("RGB", (224, 224), color=(120, 180, 200))
    im.save(buf, format="JPEG")
    return buf.getvalue()


class TestHealthEndpoint:
    def test_health_contract_keys(self, client):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()

        # Check top-level keys
        assert set(data.keys()) == {"status", "model_loaded", "classes", "gpu", "live_generation"}
        assert data["status"] == "ok"
        assert isinstance(data["model_loaded"], bool)
        assert data["classes"] == CLASS_NAMES

        # Check gpu object
        gpu = data["gpu"]
        assert set(gpu.keys()) == {"available", "name", "vram_gb"}
        assert isinstance(gpu["available"], bool)
        assert gpu["name"] is None or isinstance(gpu["name"], str)
        assert isinstance(gpu["vram_gb"], (int, float))

        # Check live_generation object
        lg = data["live_generation"]
        assert set(lg.keys()) == {"available", "reason"}
        assert isinstance(lg["available"], bool)
        assert lg["reason"] is None or isinstance(lg["reason"], str)


class TestEffectsEndpoint:
    def test_effects_contract_keys(self, client):
        resp = client.get("/api/effects")
        assert resp.status_code == 200
        data = resp.json()

        assert "axes" in data
        assert isinstance(data["axes"], list)
        assert len(data["axes"]) == 3

        found_axes = {}
        for axis in data["axes"]:
            assert set(axis.keys()) == {"id", "label", "effects"}
            assert axis["id"] in {"lighting", "contamination", "condition"}
            assert isinstance(axis["label"], str)
            assert isinstance(axis["effects"], list)

            effect_ids = []
            for eff in axis["effects"]:
                assert set(eff.keys()) == {"id", "label"}
                assert isinstance(eff["id"], str)
                assert isinstance(eff["label"], str)
                effect_ids.append(eff["id"])
            found_axes[axis["id"]] = effect_ids

        # Verify canonical effect IDs
        assert set(found_axes["lighting"]) == {
            "brightness_contrast", "shadow", "color_temperature", "low_light", "glare"
        }
        assert set(found_axes["contamination"]) == {
            "noise", "blur", "occlusion_patches", "stain_overlay"
        }
        assert set(found_axes["condition"]) == {
            "rotation", "perspective", "elastic", "crumple", "partial_crop"
        }


class TestGalleryEndpoint:
    def test_gallery_contract_keys(self, client):
        resp = client.get("/api/gallery?page=1&page_size=10")
        assert resp.status_code == 200
        data = resp.json()

        assert set(data.keys()) == {"total", "page", "page_size", "items"}
        assert isinstance(data["total"], int)
        assert data["page"] == 1
        assert data["page_size"] == 10
        assert isinstance(data["items"], list)

        if data["items"]:
            item = data["items"][0]
            expected_keys = {
                "id", "class", "axis", "mode", "strength",
                "prompt", "kept", "original_url", "generated_url"
            }
            assert set(item.keys()) == expected_keys
            assert item["class"] in CLASS_NAMES
            assert item["axis"] in {"lighting", "contamination", "condition"}
            assert item["mode"] in {"img2img", "inpaint"}
            assert isinstance(item["strength"], (int, float))
            assert isinstance(item["prompt"], str)
            assert isinstance(item["kept"], bool)
            assert item["generated_url"].startswith("/files/")
            if item["original_url"]:
                assert item["original_url"].startswith("/files/")

    def test_gallery_filtering(self, client):
        resp = client.get("/api/gallery?cls=plastic&axis=lighting&page=1&page_size=5")
        assert resp.status_code == 200
        data = resp.json()
        for item in data["items"]:
            assert item["class"] == "plastic"
            assert item["axis"] == "lighting"


class TestResultsEndpoint:
    def test_results_contract_keys(self, client):
        resp = client.get("/api/results")
        assert resp.status_code == 200
        data = resp.json()

        assert set(data.keys()) == {"source", "models", "notes", "figures"}
        assert isinstance(data["source"], str)
        assert isinstance(data["models"], list)
        assert len(data["models"]) == 4

        for m in data["models"]:
            assert set(m.keys()) == {"id", "name", "description", "trashnet", "taco", "robustness"}
            assert m["id"] in {"A_baseline", "B_classical", "C_generative", "D_classical_generative"}

            # trashnet metrics
            tnet = m["trashnet"]
            assert set(tnet.keys()) == {"accuracy", "macro_f1"}
            if tnet["accuracy"] is not None:
                assert 0.0 <= tnet["accuracy"] <= 1.0

            # taco metrics
            taco = m["taco"]
            assert set(taco.keys()) == {"accuracy", "macro_f1", "ci_low", "ci_high"}
            if taco["accuracy"] is not None:
                assert 0.0 <= taco["accuracy"] <= 1.0

            # robustness metrics
            rob = m["robustness"]
            assert set(rob.keys()) == {"lighting", "contamination", "condition", "mean"}
            for k in ["lighting", "contamination", "condition", "mean"]:
                if rob[k] is not None:
                    assert 0.0 <= rob[k] <= 1.0

        # notes: check that caveats from summary.md are present
        assert isinstance(data["notes"], list)
        assert len(data["notes"]) > 0
        for note in data["notes"]:
            assert isinstance(note, str)
            assert not note.startswith("- ")  # Markdown bullet stripped

        # figures
        assert isinstance(data["figures"], list)
        assert len(data["figures"]) > 0
        for fig in data["figures"]:
            assert set(fig.keys()) == {"title", "url"}
            assert fig["url"].startswith("/files/figures/")


class TestAugmentAndJobsLifecycle:
    def test_augment_and_job_execution(self, client, sample_image_bytes):
        # 1. Submit augment job
        files = [("files", ("can.jpg", sample_image_bytes, "image/jpeg"))]
        data = {
            "axes": '["lighting"]',
            "effects": '["brightness_contrast"]',
            "intensity": "0.5",
            "variants_per_image": "2",
            "seed": "42",
            "labels": '{"can.jpg": "metal"}',
        }
        post_resp = client.post("/api/augment", data=data, files=files)
        assert post_resp.status_code == 202
        post_data = post_resp.json()
        assert "job_id" in post_data
        job_id = post_data["job_id"]

        # 2. Check GET /api/jobs
        jobs_resp = client.get("/api/jobs")
        assert jobs_resp.status_code == 200
        jobs_data = jobs_resp.json()
        assert "jobs" in jobs_data
        matching = [j for j in jobs_data["jobs"] if j["job_id"] == job_id]
        assert len(matching) == 1
        summary = matching[0]
        assert set(summary.keys()) == {"job_id", "type", "status", "created_at", "n_sources", "n_variants"}
        assert summary["type"] == "augment"

        # 3. Poll GET /api/jobs/{job_id} until done
        for _ in range(50):
            detail_resp = client.get(f"/api/jobs/{job_id}")
            assert detail_resp.status_code == 200
            detail = detail_resp.json()
            assert set(detail.keys()) == {"job_id", "type", "status", "progress", "eta_seconds", "error", "result"}
            assert set(detail["progress"].keys()) == {"done", "total"}

            if detail["status"] == "done":
                break
            time.sleep(0.1)
        else:
            pytest.fail(f"Job {job_id} did not finish within 5 seconds")

        # 4. Verify completed result structure
        assert detail["status"] == "done"
        assert detail["result"] is not None
        assert "sources" in detail["result"]
        assert len(detail["result"]["sources"]) == 1
        src = detail["result"]["sources"][0]
        assert set(src.keys()) == {"source_id", "name", "label", "url", "variants"}
        assert src["label"] == "metal"
        assert src["url"].startswith("/files/")
        assert len(src["variants"]) == 2

        for v in src["variants"]:
            assert set(v.keys()) == {"variant_id", "url", "axis", "effect", "params"}
            assert v["axis"] == "lighting"
            assert v["effect"] == "brightness_contrast"
            assert v["url"].startswith("/files/")
            assert isinstance(v["params"], dict)

        # 5. Classify the augmented job
        cls_resp = client.post("/api/classify", json={"job_id": job_id})
        assert cls_resp.status_code == 200
        cls_data = cls_resp.json()
        assert set(cls_data.keys()) == {"job_id", "model", "summary", "items"}
        assert cls_data["job_id"] == job_id
        assert set(cls_data["summary"].keys()) == {"total_variants", "prediction_changed"}
        assert cls_data["summary"]["total_variants"] == 2

        assert len(cls_data["items"]) == 1
        item = cls_data["items"][0]
        assert set(item.keys()) == {"source_id", "original", "variants"}
        assert set(item["original"].keys()) == {"label", "confidence", "probs"}
        assert item["original"]["label"] in CLASS_NAMES
        assert abs(sum(item["original"]["probs"].values()) - 1.0) < 1e-4

        assert len(item["variants"]) == 2
        for var_res in item["variants"]:
            assert set(var_res.keys()) == {"variant_id", "label", "confidence", "changed"}
            assert var_res["label"] in CLASS_NAMES
            assert isinstance(var_res["changed"], bool)

    def test_job_cancellation(self, client, sample_image_bytes):
        files = [("files", ("test.jpg", sample_image_bytes, "image/jpeg"))]
        data = {
            "axes": '["condition"]',
            "variants_per_image": "5",
        }
        post_resp = client.post("/api/augment", data=data, files=files)
        job_id = post_resp.json()["job_id"]

        cancel_resp = client.post(f"/api/jobs/{job_id}/cancel")
        assert cancel_resp.status_code == 200
        assert cancel_resp.json() == {"status": "cancelled"}
