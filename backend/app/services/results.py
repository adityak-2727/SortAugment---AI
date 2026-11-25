"""
Results service: parse results.csv, eval_main.csv, and summary.md
into the /api/results contract shape.

NEVER hard-codes numbers.  Returns null where a value is missing.
Caveats are parsed from the actual "## Caveats" section of summary.md
with Markdown symbols stripped (bullets, backticks) but content unchanged.
"""
from __future__ import annotations

import csv
import logging
import re
from pathlib import Path

from app.config import (
    RESULTS_CSV, EVAL_MAIN_CSV, SUMMARY_MD_PATH, FIGURES_DIR,
)

logger = logging.getLogger(__name__)

# Human-readable names and descriptions for each model
MODEL_INFO = {
    "A_baseline": {
        "name": "Baseline",
        "description": "ResNet18 trained on original TrashNet images only",
    },
    "B_classical": {
        "name": "Classical Augmentation",
        "description": "ResNet18 + classical lighting/contamination/condition augmentations",
    },
    "C_generative": {
        "name": "Generative Augmentation",
        "description": "ResNet18 + SDXL img2img and inpainting augmentations",
    },
    "D_classical_generative": {
        "name": "Classical + Generative",
        "description": "ResNet18 + both classical and generative augmentation pools",
    },
}


def _safe_float(val) -> float | None:
    """Parse a float, returning None on failure."""
    if val is None or val == "":
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _parse_results_csv() -> dict[str, dict]:
    """
    Parse results.csv into {model_id: {trashnet_acc, taco_acc, robust_*, ...}}.
    """
    if not RESULTS_CSV.exists():
        logger.warning("results.csv not found at %s", RESULTS_CSV)
        return {}

    models = {}
    with open(RESULTS_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            mid = row.get("model", "").strip()
            if not mid:
                continue
            models[mid] = {
                "trashnet_acc": _safe_float(row.get("trashnet_acc")),
                "trashnet_macro_f1": _safe_float(row.get("trashnet_macro_f1")),
                "taco_acc": _safe_float(row.get("taco_acc")),
                "taco_macro_f1": _safe_float(row.get("taco_macro_f1")),
                "robust_lighting": _safe_float(row.get("robust_lighting")),
                "robust_contamination": _safe_float(row.get("robust_contamination")),
                "robust_condition": _safe_float(row.get("robust_condition")),
                "robust_mean": _safe_float(row.get("robust_mean")),
            }
    return models


def _parse_eval_main_csv() -> dict[str, dict]:
    """
    Parse eval_main.csv for CI bounds.
    Returns {model_id: {taco_ci_low, taco_ci_high, trashnet_ci_low, ...}}.
    """
    if not EVAL_MAIN_CSV.exists():
        logger.warning("eval_main.csv not found at %s", EVAL_MAIN_CSV)
        return {}

    result: dict[str, dict] = {}
    with open(EVAL_MAIN_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            mid = row.get("model", "").strip()
            dset = row.get("set", "").strip()
            if not mid:
                continue
            if mid not in result:
                result[mid] = {}
            prefix = ""
            if "taco" in dset.lower():
                prefix = "taco_"
            elif "trashnet" in dset.lower():
                prefix = "trashnet_"
            result[mid][f"{prefix}ci_low"] = _safe_float(row.get("acc_lo"))
            result[mid][f"{prefix}ci_high"] = _safe_float(row.get("acc_hi"))
    return result


def _parse_caveats() -> list[str]:
    """
    Parse the "## Caveats" section from summary.md.
    Returns each bullet point as a string with Markdown symbols stripped
    (- prefix, backtick formatting) but content otherwise unchanged.
    """
    if not SUMMARY_MD_PATH.exists():
        logger.warning("summary.md not found at %s", SUMMARY_MD_PATH)
        return []

    text = SUMMARY_MD_PATH.read_text(encoding="utf-8")

    # Find the Caveats section
    caveats_match = re.search(
        r"##\s+Caveats.*?\n(.*?)(?=\n##|\Z)",
        text,
        re.DOTALL | re.IGNORECASE,
    )
    if not caveats_match:
        logger.warning("No '## Caveats' section found in summary.md")
        return []

    caveats_text = caveats_match.group(1)

    # Extract bullet points (lines starting with -)
    notes = []
    for line in caveats_text.split("\n"):
        line = line.strip()
        if line.startswith("- "):
            # Strip the "- " prefix
            note = line[2:]
            # Strip backtick formatting: `text` -> text
            note = re.sub(r"`([^`]*)`", r"\1", note)
            if note:
                notes.append(note)

    return notes


def _list_figures() -> list[dict]:
    """List all figure PNGs in the figures directory."""
    if not FIGURES_DIR.exists():
        return []
    figures = []
    for f in sorted(FIGURES_DIR.glob("*.png")):
        # Derive a readable title from the filename
        # e.g. "03_classical_examples.png" -> "Classical examples"
        stem = f.stem
        # Remove leading number and underscore
        title = re.sub(r"^\d+_", "", stem)
        title = title.replace("_", " ").strip().capitalize()
        figures.append({
            "title": title,
            "url": f"/files/figures/{f.name}",
        })
    return figures


def build_results_response() -> dict:
    """
    Build the full /api/results contract response from CSV data.
    Never hard-codes numbers; returns null where a value is missing.
    """
    results = _parse_results_csv()
    ci_data = _parse_eval_main_csv()
    notes = _parse_caveats()
    figures = _list_figures()

    models = []
    for mid in ["A_baseline", "B_classical", "C_generative", "D_classical_generative"]:
        r = results.get(mid, {})
        ci = ci_data.get(mid, {})
        info = MODEL_INFO.get(mid, {"name": mid, "description": ""})

        models.append({
            "id": mid,
            "name": info["name"],
            "description": info["description"],
            "trashnet": {
                "accuracy": r.get("trashnet_acc"),
                "macro_f1": r.get("trashnet_macro_f1"),
            },
            "taco": {
                "accuracy": r.get("taco_acc"),
                "macro_f1": r.get("taco_macro_f1"),
                "ci_low": ci.get("taco_ci_low"),
                "ci_high": ci.get("taco_ci_high"),
            },
            "robustness": {
                "lighting": r.get("robust_lighting"),
                "contamination": r.get("robust_contamination"),
                "condition": r.get("robust_condition"),
                "mean": r.get("robust_mean"),
            },
        })

    return {
        "source": "Computed from results.csv and eval_main.csv (SortAugment AI notebook, single seed=42 run)",
        "models": models,
        "notes": notes,
        "figures": figures,
    }
