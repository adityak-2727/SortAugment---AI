"""GET /api/health"""
from fastapi import APIRouter
from app.config import CLASS_NAMES
from app.ml.classifier import classifier
from app.ml.generator import gpu_info, live_generation_info

router = APIRouter()


@router.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": classifier.loaded,
        "classes": CLASS_NAMES,
        "gpu": gpu_info(),
        "live_generation": live_generation_info(),
    }
