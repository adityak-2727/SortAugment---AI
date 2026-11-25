"""
Gallery service: pre-computed gallery of SDXL-generated images.

Built at startup from gen_quality_scores.csv (which includes both metadata
and the quality-filter keep/reject flag).  Each row's Colab-style paths
are mapped to local files by filename only.

The src_path (original TrashNet image) is mapped to:
    assets/trashnet/dataset-resized/{class}/{filename}

The out_path (generated image) is mapped to:
    assets/generated/{axis}/{class}/{filename}
"""
from __future__ import annotations

import csv
import logging
from pathlib import Path

from app.config import GEN_QUALITY_CSV, GENERATED_DIR, TRASHNET_DIR

logger = logging.getLogger(__name__)


class GalleryEntry:
    __slots__ = ("id", "cls", "axis", "mode", "strength", "prompt", "kept",
                 "original_url", "generated_url")

    def __init__(self, **kw):
        for k, v in kw.items():
            setattr(self, k, v)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "class": self.cls,
            "axis": self.axis,
            "mode": self.mode,
            "strength": self.strength,
            "prompt": self.prompt,
            "kept": self.kept,
            "original_url": self.original_url,
            "generated_url": self.generated_url,
        }


class GalleryService:
    """Loads and indexes the pre-generated gallery for /api/gallery."""

    def __init__(self):
        self._entries: list[GalleryEntry] = []
        self._loaded = False
        self.stats: dict = {}

    def load(self):
        """
        Parse gen_quality_scores.csv, map paths to local files, build the index.
        Logs how many rows matched and how many are missing.
        """
        if not GEN_QUALITY_CSV.exists():
            logger.warning("gen_quality_scores.csv not found at %s", GEN_QUALITY_CSV)
            self._loaded = True
            return

        entries = []
        total_rows = 0
        matched = 0
        missing_gen = 0
        missing_orig = 0
        seen_gen_names: dict[str, int] = {}  # track filename uniqueness

        with open(GEN_QUALITY_CSV, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                total_rows += 1

                # Extract filenames from Colab paths
                out_path = row.get("out_path") or row.get("path", "")
                src_path = row.get("src_path", "")
                gen_filename = Path(out_path).name
                src_filename = Path(src_path).name

                # Track uniqueness of generated filenames
                seen_gen_names[gen_filename] = seen_gen_names.get(gen_filename, 0) + 1

                label = row.get("label", "")
                axis = row.get("axis", "")
                mode = row.get("mode", "img2img")

                # Map generated image to local path
                local_gen = GENERATED_DIR / axis / label / gen_filename
                if not local_gen.exists():
                    missing_gen += 1
                    continue

                # Map original to local TrashNet path
                local_orig = TRASHNET_DIR / label / src_filename
                orig_url = None
                if local_orig.exists():
                    orig_url = f"/files/trashnet/{label}/{src_filename}"
                else:
                    missing_orig += 1

                # Parse keep flag
                keep_str = row.get("keep", "True")
                kept = keep_str.strip().lower() in ("true", "1", "yes")

                # Parse strength
                try:
                    strength = float(row.get("strength", 0.0))
                except (ValueError, TypeError):
                    strength = 0.0

                prompt = row.get("prompt", "")

                entry_id = f"gen_{total_rows:04d}"
                entries.append(GalleryEntry(
                    id=entry_id,
                    cls=label,
                    axis=axis,
                    mode=mode,
                    strength=strength,
                    prompt=prompt,
                    kept=kept,
                    original_url=orig_url,
                    generated_url=f"/files/generated/{axis}/{label}/{gen_filename}",
                ))
                matched += 1

        self._entries = entries

        # Check filename uniqueness
        duplicates = {k: v for k, v in seen_gen_names.items() if v > 1}

        self.stats = {
            "total_csv_rows": total_rows,
            "matched": matched,
            "missing_generated": missing_gen,
            "missing_originals": missing_orig,
            "duplicate_gen_names": len(duplicates),
        }

        logger.info(
            "Gallery loaded: %d/%d rows matched, %d missing generated, "
            "%d missing originals, %d duplicate filenames",
            matched, total_rows, missing_gen, missing_orig, len(duplicates),
        )
        if duplicates:
            logger.warning(
                "Duplicate generated filenames (first 5): %s",
                dict(list(duplicates.items())[:5]),
            )

        self._loaded = True

    def query(
        self,
        cls: str | None = None,
        axis: str | None = None,
        page: int = 1,
        page_size: int = 24,
    ) -> dict:
        """
        Query the gallery with optional filters and pagination.
        Returns the contract-shaped response dict.
        """
        filtered = self._entries
        if cls:
            filtered = [e for e in filtered if e.cls == cls]
        if axis:
            filtered = [e for e in filtered if e.axis == axis]

        total = len(filtered)
        start = (page - 1) * page_size
        end = start + page_size
        page_items = filtered[start:end]

        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "items": [e.to_dict() for e in page_items],
        }


# Module-level singleton
gallery_service = GalleryService()
