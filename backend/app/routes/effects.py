"""GET /api/effects"""
from fastapi import APIRouter
from app.config import EFFECTS_BY_AXIS

router = APIRouter()

AXIS_LABELS = {
    "lighting": "Lighting",
    "contamination": "Contamination",
    "condition": "Condition",
}


@router.get("/effects")
def effects():
    axes = []
    for axis_id, effect_list in EFFECTS_BY_AXIS.items():
        axes.append({
            "id": axis_id,
            "label": AXIS_LABELS.get(axis_id, axis_id.capitalize()),
            "effects": [{"id": e["id"], "label": e["label"]} for e in effect_list],
        })
    return {"axes": axes}
