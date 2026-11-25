"""POST /api/augment"""
from __future__ import annotations

import json
import logging
import uuid

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import JSONResponse

from app.config import AXES, EFFECTS_BY_AXIS, EFFECT_TO_AXIS, JOBS_DIR
from app.errors import error_response
from app.services.upload import MAX_FILES, process_upload
from app.services.jobs import job_manager

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/augment", status_code=202)
async def augment(
    files: list[UploadFile] = File(...),
    axes: str = Form(...),
    effects: str = Form(default="[]"),
    intensity: float = Form(default=0.5),
    variants_per_image: int = Form(default=3),
    seed: str = Form(default=""),
    labels: str = Form(default="{}"),
):
    # Parse JSON fields
    try:
        axes_list = json.loads(axes)
    except (json.JSONDecodeError, TypeError):
        return error_response(400, "invalid_axes", "axes must be a JSON list")

    try:
        effects_list = json.loads(effects) if effects else []
    except (json.JSONDecodeError, TypeError):
        return error_response(400, "invalid_effects", "effects must be a JSON list")

    try:
        labels_map = json.loads(labels) if labels else {}
    except (json.JSONDecodeError, TypeError):
        return error_response(400, "invalid_labels", "labels must be a JSON map")

    seed_val = None
    if seed and seed.strip():
        try:
            seed_val = int(seed)
        except ValueError:
            return error_response(400, "invalid_seed", "seed must be an integer")

    # Validate inputs
    if not files:
        return error_response(400, "no_files", "At least 1 file is required")
    if len(files) > MAX_FILES:
        return error_response(400, "too_many_files", f"Maximum {MAX_FILES} files allowed")

    if not axes_list or not isinstance(axes_list, list):
        return error_response(400, "invalid_axes", "At least 1 axis is required")
    for a in axes_list:
        if a not in AXES:
            return error_response(400, "unknown_axis", f"Unknown axis: {a}")

    # Resolve effects: if none given, use all effects of the chosen axes
    if not effects_list:
        for a in axes_list:
            for e in EFFECTS_BY_AXIS[a]:
                effects_list.append(e["id"])
    else:
        for eid in effects_list:
            if eid not in EFFECT_TO_AXIS:
                return error_response(400, "unknown_effect", f"Unknown effect: {eid}")

    if not 0 <= intensity <= 1:
        return error_response(400, "invalid_intensity", "intensity must be 0..1")
    if not 1 <= variants_per_image <= 10:
        return error_response(400, "invalid_variants", "variants_per_image must be 1..10")

    # Assign job_id upfront and save uploads directly to its job directory
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

    job_manager.create_augment_job(
        source_infos=source_infos,
        axes=axes_list,
        effects=effects_list,
        intensity=intensity,
        variants_per_image=variants_per_image,
        seed=seed_val,
        labels=labels_map,
        job_id=job_id,
    )

    return JSONResponse(status_code=202, content={"job_id": job_id})
