"""GET /api/results"""
from fastapi import APIRouter
from app.services.results import build_results_response

router = APIRouter()

# Cache the response since the data files don't change at runtime
_cached_response: dict | None = None


@router.get("/results")
def results():
    global _cached_response
    if _cached_response is None:
        _cached_response = build_results_response()
    return _cached_response
