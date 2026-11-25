"""
Export service: build a streamed ZIP from a completed job.

ZIP layout:
    <label>/<source>_<variant>.jpg
    manifest.csv  (columns: file, source_name, label, axis, effect, params_json, seed)

Optionally includes originals:
    <label>/<source>.jpg
"""
from __future__ import annotations

import csv
import io
import json
import logging
import zipfile
from pathlib import Path

from app.config import JOBS_DIR

logger = logging.getLogger(__name__)


def build_export_zip(job_info, include_originals: bool = True) -> bytes:
    """
    Build a ZIP file in memory from a completed job.
    Returns the raw ZIP bytes.
    """
    buf = io.BytesIO()
    job_dir = JOBS_DIR / job_info.job_id

    manifest_rows = []

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for src in job_info.sources:
            label = src["label"]
            name = src["name"]
            stem = Path(name).stem

            # Include original if requested
            if include_originals:
                orig_path = job_dir / "originals" / name
                if orig_path.exists():
                    arc_name = f"{label}/{name}"
                    zf.write(str(orig_path), arc_name)

            # Include variants
            for v in src.get("variants", []):
                variant_filename = v["filename"]
                variant_path = job_dir / "variants" / variant_filename
                if not variant_path.exists():
                    logger.warning("Variant file missing: %s", variant_path)
                    continue

                arc_name = f"{label}/{stem}_{v['variant_id']}{Path(variant_filename).suffix}"
                zf.write(str(variant_path), arc_name)

                params = v.get("params", {})
                seed_val = params.get("seed", "")

                manifest_rows.append({
                    "file": arc_name,
                    "source_name": name,
                    "label": label,
                    "axis": v.get("axis", ""),
                    "effect": v.get("effect", ""),
                    "params_json": json.dumps(params),
                    "seed": seed_val,
                })

        # Write manifest.csv
        if manifest_rows:
            manifest_buf = io.StringIO()
            writer = csv.DictWriter(
                manifest_buf,
                fieldnames=["file", "source_name", "label", "axis", "effect", "params_json", "seed"],
            )
            writer.writeheader()
            writer.writerows(manifest_rows)
            zf.writestr("manifest.csv", manifest_buf.getvalue())

    return buf.getvalue()
