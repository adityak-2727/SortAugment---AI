"""
Job manager: creates, tracks, and runs augment and generate jobs.

- Augment jobs run in a ThreadPoolExecutor (CPU-bound).
- Generate jobs run one at a time in a dedicated GPU worker thread (queue.Queue).
- Each job is persisted under backend/data/jobs/<job_id>/.
- Supports progress tracking, ETA estimation, and cancellation.
- Old job folders are cleaned up at startup and periodically.
"""
from __future__ import annotations

import json
import logging
import queue
import shutil
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image

from app.config import (
    JOBS_DIR,
    EFFECT_TO_AXIS,
    PROMPT_BANK,
    GEN_INPAINT_FRACTION,
    CLASS_NAMES,
)
from app.ml.effects import apply_effect
from app.ml.generator import generator_manager
from app.services.upload import image_to_array

logger = logging.getLogger(__name__)

JOB_MAX_AGE_HOURS = 24  # clean up jobs older than this


class JobInfo:
    """In-memory representation of a job."""

    def __init__(self, job_id: str, job_type: str, **kwargs):
        self.job_id = job_id
        self.type = job_type
        self.status = "queued"
        self.created_at = datetime.now(timezone.utc).isoformat()
        self.progress_done = 0
        self.progress_total = 0
        self.eta_seconds: Optional[float] = None
        self.error: Optional[str] = None
        self.cancelled = False
        self._start_time: Optional[float] = None

        # Augment-specific
        self.axes: list[str] = kwargs.get("axes", [])
        self.effects: list[str] = kwargs.get("effects", [])
        self.intensity: float = kwargs.get("intensity", 0.5)

        # Generate-specific
        self.axis: str = kwargs.get("axis", "lighting")
        self.strength: float = kwargs.get("strength", 0.4)

        # Common
        self.variants_per_image: int = kwargs.get("variants_per_image", 3)
        self.seed: Optional[int] = kwargs.get("seed")
        self.labels: dict[str, str] = kwargs.get("labels", {})

        # Source tracking
        self.sources: list[dict] = []  # [{source_id, name, label, process_path, variants: [...]}]

    @property
    def n_sources(self) -> int:
        return len(self.sources)

    @property
    def n_variants(self) -> int:
        return sum(len(s.get("variants", [])) for s in self.sources)

    def to_summary(self) -> dict:
        return {
            "job_id": self.job_id,
            "type": self.type,
            "status": self.status,
            "created_at": self.created_at,
            "n_sources": self.n_sources,
            "n_variants": self.n_variants,
        }

    def to_detail(self, base_url: str = "") -> dict:
        result = None
        if self.status == "done":
            result = {"sources": []}
            for src in self.sources:
                result["sources"].append({
                    "source_id": src["source_id"],
                    "name": src["name"],
                    "label": src["label"],
                    "url": f"/files/jobs/{self.job_id}/originals/{src['name']}",
                    "variants": [
                        {
                            "variant_id": v["variant_id"],
                            "url": f"/files/jobs/{self.job_id}/variants/{v['filename']}",
                            "axis": v["axis"],
                            "effect": v["effect"],
                            "params": v.get("params", {}),
                            **({"mode": v["mode"]} if "mode" in v else {}),
                        }
                        for v in src.get("variants", [])
                    ],
                })

        return {
            "job_id": self.job_id,
            "type": self.type,
            "status": self.status,
            "progress": {"done": self.progress_done, "total": self.progress_total},
            "eta_seconds": self.eta_seconds,
            "error": self.error,
            "result": result,
        }

    def update_eta(self):
        """Estimate remaining time based on progress so far."""
        if self._start_time and self.progress_done > 0:
            elapsed = time.time() - self._start_time
            rate = elapsed / self.progress_done
            remaining = self.progress_total - self.progress_done
            self.eta_seconds = round(rate * remaining, 1)


class JobManager:
    """Manages the lifecycle of augment and generate jobs."""

    def __init__(self):
        self._jobs: dict[str, JobInfo] = {}
        self._lock = threading.Lock()
        self._executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="augment")

        # Dedicated GPU queue and background worker thread
        self._gpu_queue: queue.Queue[str] = queue.Queue()
        self._gpu_thread = threading.Thread(target=self._gpu_worker_loop, daemon=True, name="gpu_worker")
        self._gpu_thread.start()

        JOBS_DIR.mkdir(parents=True, exist_ok=True)
        self._cleanup_old_jobs()

    def _cleanup_old_jobs(self):
        """Remove job directories older than JOB_MAX_AGE_HOURS."""
        if not JOBS_DIR.exists():
            return
        cutoff = datetime.now(timezone.utc) - timedelta(hours=JOB_MAX_AGE_HOURS)
        cleaned = 0
        for d in JOBS_DIR.iterdir():
            if not d.is_dir():
                continue
            meta_path = d / "job.json"
            try:
                if meta_path.exists():
                    meta = json.loads(meta_path.read_text())
                    created = datetime.fromisoformat(meta.get("created_at", ""))
                    if created < cutoff:
                        shutil.rmtree(d, ignore_errors=True)
                        cleaned += 1
                        continue
                mtime = datetime.fromtimestamp(d.stat().st_mtime, tz=timezone.utc)
                if mtime < cutoff:
                    shutil.rmtree(d, ignore_errors=True)
                    cleaned += 1
            except Exception:
                pass
        if cleaned:
            logger.info("Cleaned up %d old job directories", cleaned)

    def _job_dir(self, job_id: str) -> Path:
        return JOBS_DIR / job_id

    def _save_job_meta(self, job: JobInfo):
        """Persist job metadata to disk."""
        d = self._job_dir(job.job_id)
        d.mkdir(parents=True, exist_ok=True)
        meta = {
            "job_id": job.job_id,
            "type": job.type,
            "status": job.status,
            "created_at": job.created_at,
            "progress_done": job.progress_done,
            "progress_total": job.progress_total,
            "error": job.error,
            "axes": job.axes,
            "effects": job.effects,
            "intensity": job.intensity,
            "axis": job.axis,
            "strength": job.strength,
            "variants_per_image": job.variants_per_image,
            "seed": job.seed,
            "sources": job.sources,
        }
        (d / "job.json").write_text(json.dumps(meta, indent=2))

    # -----------------------------------------------------------------------
    # Augment Jobs (ThreadPool)
    # -----------------------------------------------------------------------

    def create_augment_job(
        self,
        source_infos: list[dict],
        axes: list[str],
        effects: list[str],
        intensity: float,
        variants_per_image: int,
        seed: Optional[int],
        labels: dict[str, str],
        job_id: Optional[str] = None,
    ) -> str:
        """Create and enqueue an augment job. Returns job_id."""
        job_id = job_id or uuid.uuid4().hex[:12]
        job = JobInfo(
            job_id, "augment",
            axes=axes, effects=effects, intensity=intensity,
            variants_per_image=variants_per_image, seed=seed, labels=labels,
        )

        for info in source_infos:
            source_id = uuid.uuid4().hex[:8]
            label = labels.get(info["safe_name"], "unlabeled")
            job.sources.append({
                "source_id": source_id,
                "name": info["safe_name"],
                "label": label,
                "process_path": str(info["process_path"]),
                "variants": [],
            })

        job.progress_total = len(source_infos) * variants_per_image

        with self._lock:
            self._jobs[job_id] = job
        self._save_job_meta(job)

        self._executor.submit(self._augment_worker, job_id)
        return job_id

    def _augment_worker(self, job_id: str):
        """Worker that runs an augment job in a background thread."""
        with self._lock:
            job = self._jobs.get(job_id)
        if not job:
            return

        job.status = "running"
        job._start_time = time.time()
        self._save_job_meta(job)

        variant_dir = self._job_dir(job_id) / "variants"
        variant_dir.mkdir(parents=True, exist_ok=True)

        available_effects = job.effects if job.effects else []
        if not available_effects:
            logger.error("Job %s has no effects to apply", job_id)
            job.status = "failed"
            job.error = "No effects selected"
            self._save_job_meta(job)
            return

        base_seed = job.seed if job.seed is not None else 42

        try:
            for src_idx, src in enumerate(job.sources):
                if job.cancelled:
                    break

                proc_img = Image.open(src["process_path"]).convert("RGB")
                img_array = image_to_array(proc_img)

                for v_idx in range(job.variants_per_image):
                    if job.cancelled:
                        break

                    variant_seed = base_seed + src_idx * 1000 + v_idx
                    rng = np.random.default_rng(variant_seed)

                    effect_id = available_effects[(src_idx * job.variants_per_image + v_idx) % len(available_effects)]
                    axis = EFFECT_TO_AXIS[effect_id]

                    result = apply_effect(img_array, effect_id, rng, job.intensity)

                    variant_id = uuid.uuid4().hex[:8]
                    stem = Path(src["name"]).stem
                    ext = Path(src["name"]).suffix or ".jpg"
                    variant_filename = f"{stem}_{effect_id}_{v_idx}{ext}"
                    variant_path = variant_dir / variant_filename

                    Image.fromarray(result).save(str(variant_path), quality=95)

                    src["variants"].append({
                        "variant_id": variant_id,
                        "filename": variant_filename,
                        "axis": axis,
                        "effect": effect_id,
                        "params": {"seed": variant_seed, "intensity": job.intensity},
                    })

                    job.progress_done += 1
                    job.update_eta()

                self._save_job_meta(job)

            if job.cancelled:
                job.status = "cancelled"
            else:
                job.status = "done"
                job.eta_seconds = None

        except Exception as e:
            logger.exception("Augment job %s failed", job_id)
            job.status = "failed"
            job.error = str(e)

        self._save_job_meta(job)

    # -----------------------------------------------------------------------
    # Generate Jobs (Dedicated GPU Worker Queue)
    # -----------------------------------------------------------------------

    def create_generate_job(
        self,
        source_infos: list[dict],
        axis: str,
        strength: float,
        variants_per_image: int,
        seed: Optional[int],
        labels: dict[str, str],
        job_id: Optional[str] = None,
    ) -> str:
        """Create and enqueue a generate job onto the GPU queue. Returns job_id."""
        job_id = job_id or uuid.uuid4().hex[:12]
        job = JobInfo(
            job_id, "generate",
            axis=axis, strength=strength,
            variants_per_image=variants_per_image, seed=seed, labels=labels,
        )

        for info in source_infos:
            source_id = uuid.uuid4().hex[:8]
            label = labels.get(info["safe_name"], "unlabeled")
            job.sources.append({
                "source_id": source_id,
                "name": info["safe_name"],
                "label": label,
                "process_path": str(info["process_path"]),
                "variants": [],
            })

        job.progress_total = len(source_infos) * variants_per_image

        with self._lock:
            self._jobs[job_id] = job
        self._save_job_meta(job)

        # Enqueue onto the dedicated single-GPU worker queue
        self._gpu_queue.put(job_id)
        return job_id

    def _gpu_worker_loop(self):
        """Dedicated thread executing one GPU generation job at a time."""
        logger.info("GPU generation worker loop started")
        while True:
            try:
                job_id = self._gpu_queue.get()
                self._execute_generate_job(job_id)
            except Exception as e:
                logger.exception("Unexpected error in GPU worker loop: %s", e)
            finally:
                self._gpu_queue.task_done()

    def _execute_generate_job(self, job_id: str):
        with self._lock:
            job = self._jobs.get(job_id)
        if not job:
            return

        if job.cancelled:
            job.status = "cancelled"
            self._save_job_meta(job)
            return

        job.status = "running"
        job._start_time = time.time()
        self._save_job_meta(job)

        variant_dir = self._job_dir(job_id) / "variants"
        variant_dir.mkdir(parents=True, exist_ok=True)

        base_seed = job.seed if job.seed is not None else 42
        axis = job.axis

        try:
            for src_idx, src in enumerate(job.sources):
                if job.cancelled:
                    break

                src_label = src["label"] if src["label"] in CLASS_NAMES else "plastic"
                src_img = Image.open(src["process_path"]).convert("RGB")

                for v_idx in range(job.variants_per_image):
                    if job.cancelled:
                        break

                    var_seed = base_seed + src_idx * 1000 + v_idx
                    rng = np.random.default_rng(var_seed)

                    # Determine inpaint vs img2img mode
                    inpaint_bank = PROMPT_BANK.get("inpaint", {}).get(src_label, {}).get(axis, [])
                    can_inpaint = len(inpaint_bank) > 0
                    inpaint_frac = GEN_INPAINT_FRACTION.get(axis, 0.0)

                    mode = "inpaint" if (can_inpaint and rng.random() < inpaint_frac) else "img2img"

                    if mode == "inpaint":
                        prompt = inpaint_bank[int(rng.integers(len(inpaint_bank)))]
                    else:
                        img2img_bank = PROMPT_BANK.get("img2img", {}).get(src_label, {}).get(axis, [])
                        if not img2img_bank:
                            img2img_bank = [f"a recyclable {src_label} under sorting line lighting"]
                        prompt = img2img_bank[int(rng.integers(len(img2img_bank)))]

                    # Run generation through generator_manager
                    gen_img, used_model = generator_manager.generate(
                        src_image=src_img,
                        mode=mode,
                        prompt=prompt,
                        strength=job.strength,
                        seed=var_seed,
                    )

                    # Save generated variant
                    variant_id = uuid.uuid4().hex[:8]
                    stem = Path(src["name"]).stem
                    ext = Path(src["name"]).suffix or ".jpg"
                    variant_filename = f"{stem}_gen_{mode}_{v_idx}{ext}"
                    variant_path = variant_dir / variant_filename

                    gen_img.save(str(variant_path), quality=95)

                    src["variants"].append({
                        "variant_id": variant_id,
                        "filename": variant_filename,
                        "axis": axis,
                        "effect": f"{used_model}_{mode}",
                        "mode": mode,
                        "params": {
                            "model": used_model,
                            "prompt": prompt,
                            "strength": job.strength,
                            "seed": var_seed,
                        },
                    })

                    job.progress_done += 1
                    job.update_eta()
                    self._save_job_meta(job)

            if job.cancelled:
                job.status = "cancelled"
            else:
                job.status = "done"
                job.eta_seconds = None

        except Exception as e:
            logger.exception("Generate job %s failed: %s", job_id, e)
            job.status = "failed"
            job.error = str(e)

        self._save_job_meta(job)

    # -----------------------------------------------------------------------
    # Common Job Access
    # -----------------------------------------------------------------------

    def get_job(self, job_id: str) -> Optional[JobInfo]:
        with self._lock:
            return self._jobs.get(job_id)

    def list_jobs(self) -> list[dict]:
        with self._lock:
            return [j.to_summary() for j in self._jobs.values()]

    def cancel_job(self, job_id: str) -> bool:
        """Signal a job to cancel. Returns True if the job exists."""
        with self._lock:
            job = self._jobs.get(job_id)
        if not job:
            return False
        job.cancelled = True
        if job.status == "queued":
            job.status = "cancelled"
            self._save_job_meta(job)
        return True

    def cleanup_now(self):
        """Run cleanup immediately."""
        self._cleanup_old_jobs()


# Module-level singleton
job_manager = JobManager()
