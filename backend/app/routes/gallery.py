"""GET /api/gallery"""
from fastapi import APIRouter, Query
from app.services.gallery import gallery_service

router = APIRouter()


@router.get("/gallery")
def gallery(
    cls: str = Query(default=None, alias="cls"),
    axis: str = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=24, ge=1, le=100),
):
    return gallery_service.query(cls=cls, axis=axis, page=page, page_size=page_size)
