"""
GET  /api/jobs
GET  /api/jobs/{job_id}
POST /api/jobs/{job_id}/cancel
GET  /api/jobs/{job_id}/export
"""
from __future__ import annotations

from fastapi import APIRouter, Query
from fastapi.responses import Response

from app.errors import error_response
from app.services.jobs import job_manager
from app.services.export import build_export_zip

router = APIRouter()


@router.get("/jobs")
def list_jobs():
    return {"jobs": job_manager.list_jobs()}


@router.get("/jobs/{job_id}")
def get_job(job_id: str):
    job = job_manager.get_job(job_id)
    if not job:
        return error_response(404, "job_not_found", f"No job with id '{job_id}'")
    return job.to_detail()


@router.post("/jobs/{job_id}/cancel")
def cancel_job(job_id: str):
    if not job_manager.cancel_job(job_id):
        return error_response(404, "job_not_found", f"No job with id '{job_id}'")
    return {"status": "cancelled"}


@router.get("/jobs/{job_id}/export")
def export_job(job_id: str, include_originals: bool = Query(default=True)):
    job = job_manager.get_job(job_id)
    if not job:
        return error_response(404, "job_not_found", f"No job with id '{job_id}'")
    if job.status != "done":
        return error_response(400, "job_not_done", f"Job status is '{job.status}', not 'done'")

    zip_bytes = build_export_zip(job, include_originals=include_originals)
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename=augmented_{job_id}.zip"},
    )
