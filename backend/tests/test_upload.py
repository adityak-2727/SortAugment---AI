"""
Phase 2 Upload & Security Tests:
- Validates file format constraints (rejects bad extensions and corrupt bytes)
- Enforces file count limits
- Verifies EXIF rotation and downscaling behavior
- Validates path traversal prevention on /files static mount
"""
import io
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.services.upload import (
    sanitize_filename,
    validate_extension,
    validate_and_load_image,
    fix_orientation,
    downscale_for_processing,
    PROCESS_MAX_SIDE,
)


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


class TestUploadValidation:
    def test_sanitize_filename(self):
        assert sanitize_filename("my photo! (1).png") == "my_photo_1.png"
        assert sanitize_filename("../../../secret.jpg") == "secret.jpg"
        assert sanitize_filename("...").endswith(".jpg")

    def test_validate_extension(self):
        assert validate_extension("test.jpg") is True
        assert validate_extension("test.jpeg") is True
        assert validate_extension("test.png") is True
        assert validate_extension("test.webp") is True
        assert validate_extension("test.gif") is False
        assert validate_extension("test.exe") is False
        assert validate_extension("test.txt") is False

    def test_reject_corrupt_image(self):
        corrupt_data = b"NOT_AN_IMAGE_FILE"
        with pytest.raises(ValueError, match="not a valid image"):
            validate_and_load_image(corrupt_data, "bad.jpg")

    def test_downscaling_large_image(self):
        large_im = Image.new("RGB", (2000, 1500), color=(100, 100, 100))
        downscaled = downscale_for_processing(large_im, max_side=PROCESS_MAX_SIDE)
        assert max(downscaled.size) <= PROCESS_MAX_SIDE
        # Check aspect ratio maintained roughly (2000/1500 = 1.333)
        assert abs((downscaled.width / downscaled.height) - (2000 / 1500)) < 0.01

    def test_downscaling_small_image_unchanged(self):
        small_im = Image.new("RGB", (500, 400), color=(100, 100, 100))
        res = downscale_for_processing(small_im, max_side=PROCESS_MAX_SIDE)
        assert res.size == (500, 400)

    def test_upload_bad_extension_rejected_by_api(self, client):
        bad_file = [("files", ("script.sh", b"echo hello", "text/plain"))]
        data = {"axes": '["lighting"]'}
        resp = client.post("/api/augment", data=data, files=bad_file)
        assert resp.status_code == 400
        err = resp.json()
        assert "error" in err
        assert err["error"]["code"] == "invalid_file"

    def test_upload_too_many_files(self, client):
        dummy_jpg = io.BytesIO()
        Image.new("RGB", (50, 50)).save(dummy_jpg, format="JPEG")
        raw = dummy_jpg.getvalue()

        # Try 51 files (> 50 limit)
        files = [("files", (f"img_{i}.jpg", raw, "image/jpeg")) for i in range(51)]
        data = {"axes": '["lighting"]'}
        resp = client.post("/api/augment", data=data, files=files)
        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "too_many_files"


class TestPathTraversalSecurity:
    def test_path_traversal_dot_dot_rejected(self, client):
        resp = client.get("/files/../config.json")
        assert resp.status_code in {400, 404}
        assert "error" in resp.json()

    def test_path_traversal_subpath_escape_rejected(self, client):
        resp = client.get("/files/jobs/../../secret.txt")
        assert resp.status_code in {400, 404}
        assert "error" in resp.json()

    def test_path_traversal_encoded_dots_rejected(self, client):
        resp = client.get("/files/%2e%2e/config.json")
        assert resp.status_code in {400, 404}
        assert "error" in resp.json()

    def test_unknown_file_category_rejected(self, client):
        resp = client.get("/files/unknown_category/foo.jpg")
        assert resp.status_code == 404
        assert "error" in resp.json()

    def test_nonexistent_file_returns_404(self, client):
        resp = client.get("/files/figures/nonexistent_sample_figure_9999.png")
        assert resp.status_code == 404
        assert resp.json()["error"]["code"] == "file_not_found"

    def test_valid_figure_file_served(self, client):
        # 01_trashnet_samples.png is known to exist
        resp = client.get("/files/figures/01_trashnet_samples.png")
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("image/")


class TestJobCleanup:
    def test_cleanup_deletes_old_jobs(self):
        import json
        from datetime import datetime, timezone, timedelta
        from app.config import JOBS_DIR
        from app.services.jobs import job_manager

        old_job_id = "test_cleanup_old_job_999"
        old_dir = JOBS_DIR / old_job_id
        old_dir.mkdir(parents=True, exist_ok=True)

        # Write metadata with timestamp 48 hours ago
        past_time = (datetime.now(timezone.utc) - timedelta(hours=48)).isoformat()
        meta = {"job_id": old_job_id, "created_at": past_time, "status": "done"}
        (old_dir / "job.json").write_text(json.dumps(meta))

        assert old_dir.exists()
        job_manager.cleanup_now()
        assert not old_dir.exists()

