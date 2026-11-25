"""POST /api/generate"""
from __future__ import annotations

import json
import logging
import uuid

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import JSONResponse

from app.config import AXES, JOBS_DIR
from app.errors import error_response
from app.ml.generator import gpu_info, live_generation_info
from app.services.jobs import job_manager
from app.services.upload import MAX_FILES, process_upload

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/generate", status_code=202)
async def generate(
    files: list[UploadFile] = File(...),
    axis: str = Form(...),
    strength: float = Form(default=0.4),
    variants_per_image: int = Form(default=1),
    seed: str = Form(default=""),
    labels: str = Form(default="{}"),
):
    # Check GPU availability first
    gpu = gpu_info()
    if not gpu["available"]:
        info = live_generation_info()
        return error_response(
            503,
            "gpu_unavailable",
            info["reason"] or "CUDA GPU is required for live generation",
        )

    # Validate axis
    if axis not in AXES:
        return error_response(400, "unknown_axis", f"Unknown axis: '{axis}'. Expected one of {AXES}")

    # Validate strength (contract: 0.3..0.7)
    if not (0.3 <= strength <= 0.7):
        return error_response(400, "invalid_strength", "strength must be between 0.3 and 0.7")

    # Validate variants_per_image (contract: 1..3)
    if not (1 <= variants_per_image <= 3):
        return error_response(400, "invalid_variants", "variants_per_image must be between 1 and 3")

    # Parse seed
    seed_val = None
    if seed and seed.strip():
        try:
            seed_val = int(seed)
        except ValueError:
            return error_response(400, "invalid_seed", "seed must be an integer")

    # Parse labels
    try:
        labels_map = json.loads(labels) if labels else {}
    except (json.JSONDecodeError, TypeError):
        return error_response(400, "invalid_labels", "labels must be a JSON map")

    # Validate files
    if not files:
        return error_response(400, "no_files", "At least 1 file is required")
    if len(files) > MAX_FILES:
        return error_response(400, "too_many_files", f"Maximum {MAX_FILES} files allowed")

    # Create job directory and process uploads
    job_id = uuid.uuid4().hex[:12]
    job_dir = JOBS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    source_infos = []
    for f in files:
        data = await f.read()
        try:
            info = process_upload(data, f.filename or "upload.jpg", job_dir)
            source_infos.append(info)
        except ValueError as e:
            return error_response(400, "invalid_file", str(e))

    # Queue generation job
    job_manager.create_generate_job(
        source_infos=source_infos,
        axis=axis,
        strength=strength,
        variants_per_image=variants_per_image,
        seed=seed_val,
        labels=labels_map,
        job_id=job_id,
    )

    return JSONResponse(status_code=202, content={"job_id": job_id})
