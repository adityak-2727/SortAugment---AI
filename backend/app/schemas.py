"""
Pydantic schemas matching every contract response shape.
"""
from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, Field


# ---- /api/health ----
class GpuInfo(BaseModel):
    available: bool
    name: Optional[str]
    vram_gb: float

class LiveGenerationInfo(BaseModel):
    available: bool
    reason: Optional[str]

class HealthResponse(BaseModel):
    status: str = "ok"
    model_loaded: bool
    classes: list[str]
    gpu: GpuInfo
    live_generation: LiveGenerationInfo

# ---- /api/effects ----
class EffectItem(BaseModel):
    id: str
    label: str

class AxisItem(BaseModel):
    id: str
    label: str
    effects: list[EffectItem]

class EffectsResponse(BaseModel):
    axes: list[AxisItem]

# ---- /api/augment & /api/generate ----
class JobCreatedResponse(BaseModel):
    job_id: str

# ---- /api/jobs ----
class JobSummaryItem(BaseModel):
    job_id: str
    type: str
    status: str
    created_at: str
    n_sources: int
    n_variants: int

class JobListResponse(BaseModel):
    jobs: list[JobSummaryItem]

class JobProgress(BaseModel):
    done: int = 0
    total: int = 0

class VariantResult(BaseModel):
    variant_id: str
    url: str
    axis: str
    effect: str
    params: dict = Field(default_factory=dict)
    # generate jobs add "mode"
    mode: Optional[str] = None

class SourceResult(BaseModel):
    source_id: str
    name: str
    label: str
    url: str
    variants: list[VariantResult]

class JobResultPayload(BaseModel):
    sources: list[SourceResult]

class JobDetailResponse(BaseModel):
    job_id: str
    type: str
    status: str
    progress: JobProgress
    eta_seconds: Optional[float] = None
    error: Optional[str] = None
    result: Optional[JobResultPayload] = None

class CancelResponse(BaseModel):
    status: str = "cancelled"

# ---- /api/classify ----
class ClassifyOriginal(BaseModel):
    label: str
    confidence: float
    probs: dict[str, float]

class ClassifyVariant(BaseModel):
    variant_id: str
    label: str
    confidence: float
    changed: bool

class ClassifyItem(BaseModel):
    source_id: str
    original: ClassifyOriginal
    variants: list[ClassifyVariant]

class ClassifySummary(BaseModel):
    total_variants: int = 0
    prediction_changed: int = 0

class ClassifyResponse(BaseModel):
    job_id: str
    model: str
    summary: ClassifySummary
    items: list[ClassifyItem]

# ---- /api/gallery ----
class GalleryItem(BaseModel):
    id: str
    cls: str = Field(alias="class")
    axis: str
    mode: str
    strength: float
    prompt: str
    kept: bool
    original_url: Optional[str]
    generated_url: str

    model_config = {"populate_by_name": True}

class GalleryResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[GalleryItem]

# ---- /api/results ----
class DatasetMetrics(BaseModel):
    accuracy: Optional[float] = None
    macro_f1: Optional[float] = None

class TacoMetrics(DatasetMetrics):
    ci_low: Optional[float] = None
    ci_high: Optional[float] = None

class RobustnessMetrics(BaseModel):
    lighting: Optional[float] = None
    contamination: Optional[float] = None
    condition: Optional[float] = None
    mean: Optional[float] = None

class ModelResult(BaseModel):
    id: str
    name: str
    description: str
    trashnet: DatasetMetrics
    taco: TacoMetrics
    robustness: RobustnessMetrics

class FigureItem(BaseModel):
    title: str
    url: str

class ResultsResponse(BaseModel):
    source: str
    models: list[ModelResult]
    notes: list[str]
    figures: list[FigureItem]

# ---- Error ----
class ErrorDetail(BaseModel):
    code: str
    message: str

class ErrorResponse(BaseModel):
    error: ErrorDetail
