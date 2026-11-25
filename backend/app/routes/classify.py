"""POST /api/classify"""
from __future__ import annotations

import logging

import numpy as np
from fastapi import APIRouter
from PIL import Image

from app.config import JOBS_DIR, IMG_SIZE
from app.errors import error_response
from app.ml.classifier import classifier
from app.services.jobs import job_manager
from app.services.upload import image_to_array

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/classify")
def classify(body: dict):
    job_id = body.get("job_id")
    if not job_id:
        return error_response(400, "missing_job_id", "job_id is required")

    job = job_manager.get_job(job_id)
    if not job:
        return error_response(404, "job_not_found", f"No job with id '{job_id}'")
    if job.status != "done":
        return error_response(400, "job_not_done", f"Job status is '{job.status}', not 'done'")
    if not classifier.loaded:
        return error_response(503, "model_not_loaded", "Classifier model is not loaded")

    job_dir = JOBS_DIR / job_id
    items = []
    total_variants = 0
    prediction_changed = 0

    for src in job.sources:
        # Classify original
        orig_path = job_dir / "originals" / src["name"]
        if not orig_path.exists():
            continue

        orig_img = Image.open(str(orig_path)).convert("RGB").resize((IMG_SIZE, IMG_SIZE), Image.BILINEAR)
        orig_array = np.asarray(orig_img, dtype=np.uint8)
        orig_pred = classifier.predict_one(orig_array)

        variant_results = []
        for v in src.get("variants", []):
            variant_path = job_dir / "variants" / v["filename"]
            if not variant_path.exists():
                continue

            var_img = Image.open(str(variant_path)).convert("RGB").resize((IMG_SIZE, IMG_SIZE), Image.BILINEAR)
            var_array = np.asarray(var_img, dtype=np.uint8)
            var_pred = classifier.predict_one(var_array)

            changed = var_pred["label"] != orig_pred["label"]
            if changed:
                prediction_changed += 1
            total_variants += 1

            variant_results.append({
                "variant_id": v["variant_id"],
                "label": var_pred["label"],
                "confidence": var_pred["confidence"],
                "changed": changed,
            })

        items.append({
            "source_id": src["source_id"],
            "original": {
                "label": orig_pred["label"],
                "confidence": orig_pred["confidence"],
                "probs": orig_pred["probs"],
            },
            "variants": variant_results,
        })

    return {
        "job_id": job_id,
        "model": "B_classical (ResNet18)",
        "summary": {
            "total_variants": total_variants,
            "prediction_changed": prediction_changed,
        },
        "items": items,
    }
