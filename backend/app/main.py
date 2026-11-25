"""
SortAugment AI — FastAPI Backend Application

- Binds to 127.0.0.1:8000
- CORS strictly restricted to http://localhost:5173
- All API routes under /api
- Static files under /files/... with path traversal protection
- Consistent contract-shaped error responses: {"error": {"code": "...", "message": "..."}}
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import unquote

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import (
    JOBS_DIR,
    GENERATED_DIR,
    TRASHNET_DIR,
    FIGURES_DIR,
    PROJECT_ROOT,
)
from app.errors import error_response
from app.ml.classifier import classifier
from app.services.gallery import gallery_service
from app.services.jobs import job_manager

# Import API routers
from app.routes.health import router as health_router
from app.routes.effects import router as effects_router
from app.routes.augment import router as augment_router
from app.routes.jobs import router as jobs_router
from app.routes.classify import router as classify_router
from app.routes.gallery import router as gallery_router
from app.routes.generate import router as generate_router
from app.routes.results import router as results_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("sortaugment")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: load classifier, build gallery index, clean old jobs
    logger.info("Initializing SortAugment AI backend...")
    try:
        classifier.load()
        logger.info("Classifier successfully loaded")
    except Exception as e:
        logger.error("Failed to load classifier: %s", e)

    try:
        gallery_service.load()
        logger.info("Gallery index successfully loaded (%d items)", len(gallery_service._entries))
    except Exception as e:
        logger.error("Failed to load gallery service: %s", e)

    job_manager.cleanup_now()
    logger.info("Backend startup complete")

    yield

    logger.info("Backend shutting down")


app = FastAPI(
    title="SortAugment AI Backend",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS: strictly restricted to http://localhost:5173 as required by contract
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
#  Contract-Shaped Error Handlers
# ---------------------------------------------------------------------------

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    code = getattr(exc, "error_code", "http_error")
    msg = str(exc.detail)
    return error_response(exc.status_code, code, msg)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    first_error = errors[0] if errors else {}
    msg = first_error.get("msg", "Invalid request parameters")
    loc = ".".join(str(l) for l in first_error.get("loc", []))
    if loc:
        msg = f"{loc}: {msg}"
    return error_response(422, "validation_error", msg)


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled server error: %s", exc)
    return error_response(500, "internal_error", "An internal server error occurred")


# ---------------------------------------------------------------------------
#  Static File Serving with Path Traversal Protection
# ---------------------------------------------------------------------------

MOUNT_ROOTS = {
    "jobs": JOBS_DIR.resolve(),
    "generated": GENERATED_DIR.resolve(),
    "trashnet": TRASHNET_DIR.resolve(),
    "figures": FIGURES_DIR.resolve(),
}


@app.get("/files/{file_path:path}")
async def serve_file(file_path: str):
    """
    Serve uploaded/generated files, original trashnet photos, and evaluation figures.
    Strictly prevents path traversal outside the designated root directories.
    """
    decoded = unquote(file_path).replace("\\", "/")

    # Check for raw path traversal tokens
    parts = [p for p in decoded.split("/") if p]
    if ".." in parts or "." in parts or any(p.startswith("~") for p in parts):
        return error_response(400, "invalid_path", "Path traversal forbidden")

    if not parts:
        return error_response(404, "file_not_found", "No path specified")

    category = parts[0]
    if category not in MOUNT_ROOTS:
        return error_response(404, "file_not_found", f"Unknown file category: '{category}'")

    root_dir = MOUNT_ROOTS[category]
    subpath = Path(*parts[1:])
    target_path = (root_dir / subpath).resolve()

    # Ensure target_path stays strictly within root_dir
    try:
        target_path.relative_to(root_dir)
    except ValueError:
        return error_response(400, "invalid_path", "Path traversal forbidden")

    if not target_path.exists() or not target_path.is_file():
        return error_response(404, "file_not_found", f"File '{file_path}' not found")

    return FileResponse(path=str(target_path))


# ---------------------------------------------------------------------------
#  API Routes Mount
# ---------------------------------------------------------------------------

app.include_router(health_router, prefix="/api", tags=["health"])
app.include_router(effects_router, prefix="/api", tags=["effects"])
app.include_router(augment_router, prefix="/api", tags=["augment"])
app.include_router(jobs_router, prefix="/api", tags=["jobs"])
app.include_router(classify_router, prefix="/api", tags=["classify"])
app.include_router(gallery_router, prefix="/api", tags=["gallery"])
app.include_router(generate_router, prefix="/api", tags=["generate"])
app.include_router(results_router, prefix="/api", tags=["results"])
