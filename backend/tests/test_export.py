"""
Phase 2 Export Tests:
- Validates streamed ZIP layout: <label>/<source>_<variant>.jpg
- Validates inclusion / exclusion of originals
- Validates manifest.csv presence and columns:
  file, source_name, label, axis, effect, params_json, seed
"""
import csv
import io
import time
import zipfile
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def completed_job_id(client):
    """Create a complete job to test export against."""
    buf = io.BytesIO()
    Image.new("RGB", (100, 100), color=(50, 150, 250)).save(buf, format="JPEG")
    raw = buf.getvalue()

    files = [("files", ("bottle.jpg", raw, "image/jpeg"))]
    data = {
        "axes": '["condition"]',
        "effects": '["rotation"]',
        "intensity": "0.5",
        "variants_per_image": "2",
        "seed": "777",
        "labels": '{"bottle.jpg": "glass"}',
    }
    resp = client.post("/api/augment", data=data, files=files)
    assert resp.status_code == 202
    job_id = resp.json()["job_id"]

    for _ in range(50):
        detail = client.get(f"/api/jobs/{job_id}").json()
        if detail["status"] == "done":
            break
        time.sleep(0.1)
    else:
        pytest.fail(f"Job {job_id} did not finish in time")

    return job_id


class TestExportEndpoint:
    def test_export_with_originals(self, client, completed_job_id):
        resp = client.get(f"/api/jobs/{completed_job_id}/export?include_originals=true")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/zip"

        zf = zipfile.ZipFile(io.BytesIO(resp.content))
        namelist = zf.namelist()

        # Must have manifest.csv
        assert "manifest.csv" in namelist

        # Must have original under glass/
        assert "glass/bottle.jpg" in namelist

        # Must have variants under glass/
        variants_in_zip = [n for n in namelist if n.startswith("glass/bottle_") and n != "glass/bottle.jpg"]
        assert len(variants_in_zip) == 2

        # Validate manifest.csv format
        manifest_data = zf.read("manifest.csv").decode("utf-8")
        reader = csv.DictReader(io.StringIO(manifest_data))
        expected_columns = ["file", "source_name", "label", "axis", "effect", "params_json", "seed"]
        assert reader.fieldnames == expected_columns

        rows = list(reader)
        assert len(rows) == 2
        for r in rows:
            assert r["source_name"] == "bottle.jpg"
            assert r["label"] == "glass"
            assert r["axis"] == "condition"
            assert r["effect"] == "rotation"
            assert r["seed"] != ""
            assert r["file"] in namelist

    def test_export_without_originals(self, client, completed_job_id):
        resp = client.get(f"/api/jobs/{completed_job_id}/export?include_originals=false")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/zip"

        zf = zipfile.ZipFile(io.BytesIO(resp.content))
        namelist = zf.namelist()

        assert "manifest.csv" in namelist
        assert "glass/bottle.jpg" not in namelist
        variants_in_zip = [n for n in namelist if n.startswith("glass/bottle_")]
        assert len(variants_in_zip) == 2

    def test_export_nonexistent_job_returns_404(self, client):
        resp = client.get("/api/jobs/nonexistent_job_id_xyz/export")
        assert resp.status_code == 404
        assert resp.json()["error"]["code"] == "job_not_found"
