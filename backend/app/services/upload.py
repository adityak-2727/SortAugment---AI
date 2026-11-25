"""
Upload validation and preprocessing service.

Responsibilities:
  - Accept only jpg/jpeg/png/webp
  - Verify image is valid with Pillow
  - Fix EXIF orientation
  - Downscale for processing (max side ~1024) while keeping original
  - Sanitize file names
  - Enforce size and count limits
"""
from __future__ import annotations

import logging
import re
import uuid
from pathlib import Path
from io import BytesIO

import numpy as np
from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_FILE_SIZE = 20 * 1024 * 1024    # 20 MB per file
MAX_FILES = 50
PROCESS_MAX_SIDE = 1024              # downscale for effect processing


def sanitize_filename(name: str) -> str:
    """Remove unsafe characters, collapse whitespace, ensure extension."""
    stem = Path(name).stem
    ext = Path(name).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        ext = ".jpg"
    # Keep only alphanumeric, dash, underscore, dot
    stem = re.sub(r"[^\w\-.]", "_", stem)
    stem = re.sub(r"_+", "_", stem).strip("_")
    if not stem:
        stem = uuid.uuid4().hex[:8]
    return f"{stem}{ext}"


def validate_extension(filename: str) -> bool:
    """Check if the file extension is allowed."""
    return Path(filename).suffix.lower() in ALLOWED_EXTENSIONS


def validate_and_load_image(data: bytes, filename: str) -> Image.Image:
    """
    Validate image data and return a PIL Image.
    Raises ValueError on invalid input.
    """
    if len(data) > MAX_FILE_SIZE:
        raise ValueError(f"File '{filename}' exceeds {MAX_FILE_SIZE // (1024*1024)} MB limit")

    if not validate_extension(filename):
        raise ValueError(
            f"File '{filename}' has unsupported format. "
            f"Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    try:
        img = Image.open(BytesIO(data))
        img.verify()  # verify it's a valid image
        # Re-open after verify (verify closes the stream)
        img = Image.open(BytesIO(data))
    except Exception as e:
        raise ValueError(f"File '{filename}' is not a valid image: {e}")

    return img


def fix_orientation(img: Image.Image) -> Image.Image:
    """Apply EXIF orientation and convert to RGB."""
    img = ImageOps.exif_transpose(img)
    if img.mode != "RGB":
        img = img.convert("RGB")
    return img


def downscale_for_processing(img: Image.Image, max_side: int = PROCESS_MAX_SIDE) -> Image.Image:
    """Downscale so the longest side is at most max_side. Keeps aspect ratio."""
    w, h = img.size
    if max(w, h) <= max_side:
        return img
    scale = max_side / max(w, h)
    new_w, new_h = int(w * scale), int(h * scale)
    return img.resize((new_w, new_h), Image.LANCZOS)


def image_to_array(img: Image.Image, size: int | None = None) -> np.ndarray:
    """
    Convert PIL Image to uint8 RGB numpy array.
    If size is given, resize to (size, size) square.
    """
    if size is not None:
        img = img.resize((size, size), Image.BILINEAR)
    return np.asarray(img, dtype=np.uint8)


def process_upload(data: bytes, filename: str, job_dir: Path) -> dict:
    """
    Full upload pipeline: validate, fix orientation, save original + processing copy.

    Returns dict with:
      - safe_name: sanitized filename
      - original_path: path to saved original
      - process_path: path to downscaled processing copy
      - width, height: original dimensions
    """
    img = validate_and_load_image(data, filename)
    img = fix_orientation(img)

    safe_name = sanitize_filename(filename)

    # Save original
    orig_dir = job_dir / "originals"
    orig_dir.mkdir(parents=True, exist_ok=True)
    orig_path = orig_dir / safe_name
    # Avoid name collisions
    counter = 1
    while orig_path.exists():
        stem = Path(safe_name).stem
        ext = Path(safe_name).suffix
        orig_path = orig_dir / f"{stem}_{counter}{ext}"
        counter += 1
    img.save(str(orig_path), quality=95)

    # Save downscaled processing copy
    proc_img = downscale_for_processing(img)
    proc_dir = job_dir / "processing"
    proc_dir.mkdir(parents=True, exist_ok=True)
    proc_path = proc_dir / orig_path.name
    proc_img.save(str(proc_path), quality=95)

    return {
        "safe_name": orig_path.name,
        "original_path": orig_path,
        "process_path": proc_path,
        "width": img.width,
        "height": img.height,
    }
