"""
Central configuration: loads assets/config.json and defines all path constants.
"""

import json
from pathlib import Path

# ---- paths ----
# backend/ is the package root; assets/ and reference/ are siblings of backend/
BACKEND_DIR = Path(__file__).resolve().parent.parent          # d:\SortAugment\backend
PROJECT_ROOT = BACKEND_DIR.parent                             # d:\SortAugment
ASSETS_DIR = PROJECT_ROOT / "assets"
REFERENCE_DIR = PROJECT_ROOT / "reference"

MODEL_PATH = ASSETS_DIR / "best_model.pt"
CONFIG_PATH = ASSETS_DIR / "config.json"
PROMPT_BANK_PATH = ASSETS_DIR / "prompt_bank.json"
SUMMARY_MD_PATH = ASSETS_DIR / "summary.md"

TABLES_DIR = ASSETS_DIR / "tables"
FIGURES_DIR = ASSETS_DIR / "figures"
GENERATED_DIR = ASSETS_DIR / "generated"
TRASHNET_DIR = ASSETS_DIR / "trashnet" / "dataset-resized"

RESULTS_CSV = TABLES_DIR / "results.csv"
EVAL_MAIN_CSV = TABLES_DIR / "eval_main.csv"
GEN_METADATA_CSV = TABLES_DIR / "gen_metadata.csv"
GEN_QUALITY_CSV = TABLES_DIR / "gen_quality_scores.csv"

JOBS_DIR = BACKEND_DIR / "data" / "jobs"

# ---- load config.json ----
with open(CONFIG_PATH, "r") as f:
    _raw = json.load(f)

CLASS_NAMES: list[str] = _raw["CLASS_NAMES"]           # ["cardboard","glass","metal","paper","plastic","trash"]
NUM_CLASSES: int = len(CLASS_NAMES)
IMG_SIZE: int = _raw["IMG_SIZE"]                       # 224
AXES: list[str] = _raw["AXES"]                         # ["lighting","contamination","condition"]
SEED: int = _raw["SEED"]                               # 42

# Generation model ids (used by generator.py)
GEN_MODEL_ID: str = _raw["GEN_MODEL_ID"]               # "stabilityai/stable-diffusion-xl-base-1.0"
GEN_VAE_ID: str = _raw["GEN_VAE_ID"]                   # "madebyollin/sdxl-vae-fp16-fix"
GEN_FALLBACK_IDS: list[str] = _raw["GEN_FALLBACK_IDS"] # SD 1.5 repo ids
GEN_STEPS: int = _raw["GEN_STEPS"]                     # 30
GEN_SIZE_SDXL: list[int] = _raw["GEN_SIZE_SDXL"]       # [768, 576]
GEN_SIZE_SD15: list[int] = _raw["GEN_SIZE_SD15"]       # [512, 384]
GEN_STRENGTHS: dict = _raw["GEN_STRENGTHS"]
GEN_INPAINT_STRENGTHS: list[float] = _raw["GEN_INPAINT_STRENGTHS"]
GEN_INPAINT_FRACTION: dict = _raw["GEN_INPAINT_FRACTION"]
GEN_GUIDANCE: list[float] = _raw["GEN_GUIDANCE"]

# Prompt bank (loaded once)
with open(PROMPT_BANK_PATH, "r") as f:
    PROMPT_BANK: dict = json.load(f)

NEGATIVE_PROMPT: str = PROMPT_BANK["negative"]

# ---- canonical effect definitions ----
EFFECTS_BY_AXIS: dict[str, list[dict]] = {
    "lighting": [
        {"id": "brightness_contrast", "label": "Brightness & contrast"},
        {"id": "shadow",              "label": "Shadow"},
        {"id": "color_temperature",   "label": "Color temperature"},
        {"id": "low_light",           "label": "Low light"},
        {"id": "glare",               "label": "Glare"},
    ],
    "contamination": [
        {"id": "noise",              "label": "Noise"},
        {"id": "blur",               "label": "Blur"},
        {"id": "occlusion_patches",  "label": "Occlusion patches"},
        {"id": "stain_overlay",      "label": "Stain overlay"},
    ],
    "condition": [
        {"id": "rotation",      "label": "Rotation"},
        {"id": "perspective",   "label": "Perspective"},
        {"id": "elastic",       "label": "Elastic"},
        {"id": "crumple",       "label": "Crumple"},
        {"id": "partial_crop",  "label": "Partial crop"},
    ],
}

# Flat lookup: effect_id -> axis
EFFECT_TO_AXIS: dict[str, str] = {}
ALL_EFFECT_IDS: list[str] = []
for axis, effects in EFFECTS_BY_AXIS.items():
    for e in effects:
        EFFECT_TO_AXIS[e["id"]] = axis
        ALL_EFFECT_IDS.append(e["id"])
