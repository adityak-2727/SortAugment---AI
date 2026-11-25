"""
Generative image augmentation (Stable Diffusion XL / SD 1.5) for SortAugment AI.

Features:
- Lazy-loaded on first use
- SDXL fp16 img2img + inpainting with madebyollin/sdxl-vae-fp16-fix
- VAE slicing and tiling enabled to fit 8 GB VRAM
- Progressive memory optimization:
  1. Default: enable_model_cpu_offload()
  2. On OOM: try enable_sequential_cpu_offload()
  3. On persistent OOM: automatic fallback to Stable Diffusion 1.5
- Shares weights between img2img and inpainting pipelines (zero extra VRAM)
- Uses prompt bank from assets/prompt_bank.json
"""

from __future__ import annotations

import gc
import logging
import time
from typing import Optional

import cv2
import numpy as np
import torch
from PIL import Image, ImageOps

from app.config import (
    GEN_MODEL_ID,
    GEN_VAE_ID,
    GEN_FALLBACK_IDS,
    GEN_STEPS,
    GEN_SIZE_SDXL,
    GEN_SIZE_SD15,
    NEGATIVE_PROMPT,
)

logger = logging.getLogger(__name__)

# Check for CUDA at module import
_cuda_available = False
_cuda_name: Optional[str] = None
_cuda_vram_gb: float = 0.0
_unavailable_reason: Optional[str] = None

try:
    if torch.cuda.is_available():
        _cuda_available = True
        _cuda_name = torch.cuda.get_device_name(0)
        _cuda_vram_gb = round(torch.cuda.get_device_properties(0).total_memory / (1024**3), 1)
        logger.info("GPU available: %s (%.1f GB VRAM)", _cuda_name, _cuda_vram_gb)
    else:
        _unavailable_reason = "No CUDA GPU detected by PyTorch"
except Exception as e:
    _unavailable_reason = f"GPU detection failed: {e}"


def gpu_info() -> dict:
    """Return GPU status dict for /api/health."""
    return {
        "available": _cuda_available,
        "name": _cuda_name,
        "vram_gb": _cuda_vram_gb if _cuda_available else 0.0,
    }


def live_generation_info() -> dict:
    """Return live generation status for /api/health."""
    if not _cuda_available:
        return {
            "available": False,
            "reason": _unavailable_reason or "No CUDA GPU available",
        }
    return {
        "available": True,
        "reason": None,
    }


def make_mask(w: int, h: int, seed: int) -> Image.Image:
    """
    Random soft blob mask for inpainting (white = repaint).
    Covers roughly 5-20% of the image.
    Ported verbatim from notebook's make_mask.
    """
    rng = np.random.default_rng(seed)
    m = np.zeros((h, w), np.uint8)
    for _ in range(int(rng.integers(1, 3))):
        cx = int(rng.uniform(0.25, 0.75) * w)
        cy = int(rng.uniform(0.25, 0.75) * h)
        ax = int(rng.uniform(0.08, 0.20) * w)
        ay = int(rng.uniform(0.08, 0.20) * h)
        cv2.ellipse(m, (cx, cy), (ax, ay), float(rng.uniform(0, 180)), 0, 360, 255, -1)
    return Image.fromarray(cv2.GaussianBlur(m, (0, 0), 6))


def free_gpu():
    """Release GPU memory and empty PyTorch cache."""
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


class GeneratorManager:
    """Singleton managing lazy-loaded SDXL / SD 1.5 pipelines."""

    def __init__(self):
        self._name: Optional[str] = None
        self._i2i = None
        self._inp = None
        self._size = GEN_SIZE_SDXL
        self._offload_mode = "model"  # "model" or "sequential"
        self._loading = False

    @property
    def is_loaded(self) -> bool:
        return self._i2i is not None

    @property
    def model_name(self) -> Optional[str]:
        return self._name

    def release(self):
        """Unload pipelines to reclaim VRAM."""
        self._i2i = None
        self._inp = None
        self._name = None
        free_gpu()
        logger.info("Generator pipelines released from memory")

    def _load_sdxl(self, sequential: bool = False):
        from diffusers import AutoPipelineForImage2Image, AutoPipelineForInpainting, AutoencoderKL

        kw = dict(torch_dtype=torch.float16, use_safetensors=True)
        try:
            kw["vae"] = AutoencoderKL.from_pretrained(GEN_VAE_ID, torch_dtype=torch.float16)
            logger.info("Loaded custom SDXL VAE: %s", GEN_VAE_ID)
        except Exception as e:
            logger.warning("Could not load custom VAE (%s), using default: %s", GEN_VAE_ID, e)

        logger.info("Loading SDXL pipeline: %s", GEN_MODEL_ID)
        i2i = AutoPipelineForImage2Image.from_pretrained(GEN_MODEL_ID, variant="fp16", **kw)

        if sequential:
            logger.info("Enabling sequential CPU offload for SDXL")
            i2i.enable_sequential_cpu_offload()
            self._offload_mode = "sequential"
        else:
            logger.info("Enabling model CPU offload for SDXL")
            i2i.enable_model_cpu_offload()
            self._offload_mode = "model"

        try:
            i2i.vae.enable_slicing()
            i2i.vae.enable_tiling()
        except Exception as e:
            logger.warning("Could not enable VAE slicing/tiling: %s", e)

        i2i.set_progress_bar_config(disable=True)
        inp = AutoPipelineForInpainting.from_pipe(i2i)
        inp.set_progress_bar_config(disable=True)

        return "sdxl", i2i, inp, GEN_SIZE_SDXL

    def _load_sd15(self):
        from diffusers import AutoPipelineForImage2Image, AutoPipelineForInpainting

        last_err = None
        for mid in GEN_FALLBACK_IDS:
            try:
                logger.info("Attempting to load SD 1.5 fallback: %s", mid)
                i2i = AutoPipelineForImage2Image.from_pretrained(
                    mid,
                    torch_dtype=torch.float16,
                    safety_checker=None,
                    requires_safety_checker=False,
                )
                i2i.enable_model_cpu_offload()
                try:
                    i2i.vae.enable_slicing()
                except Exception:
                    pass
                i2i.set_progress_bar_config(disable=True)
                inp = AutoPipelineForInpainting.from_pipe(i2i)
                inp.set_progress_bar_config(disable=True)
                logger.info("Successfully loaded SD 1.5 fallback: %s", mid)
                return "sd15", i2i, inp, GEN_SIZE_SD15
            except Exception as e:
                logger.warning("Could not load fallback %s: %s", mid, e)
                last_err = e

        raise RuntimeError("No Stable Diffusion 1.5 fallback could be loaded") from last_err

    def load(self, force_sd15: bool = False, sequential: bool = False):
        """Load generation pipelines into memory."""
        if not torch.cuda.is_available():
            raise RuntimeError("Stable Diffusion requires a CUDA GPU.")

        self.release()

        loaded = None
        if not force_sd15:
            try:
                loaded = self._load_sdxl(sequential=sequential)
            except (torch.cuda.OutOfMemoryError, RuntimeError) as e:
                if "out of memory" in str(e).lower():
                    logger.warning("SDXL OutOfMemoryError during load -> attempting SD 1.5 fallback")
                else:
                    raise

        if loaded is None:
            loaded = self._load_sd15()

        self._name, self._i2i, self._inp, self._size = loaded
        logger.info("Generator ready: %s | target resolution: %s", self._name, self._size)

    def generate(
        self,
        src_image: Image.Image,
        mode: str,
        prompt: str,
        strength: float,
        seed: int,
        guidance: float = 5.0,
        steps: Optional[int] = None,
    ) -> tuple[Image.Image, str]:
        """
        Generate a single variation using img2img or inpainting.
        Handles out-of-memory errors by trying sequential offload then SD 1.5 fallback.

        Returns: (generated_image, model_name)
        """
        if not self.is_loaded:
            self.load()

        steps = steps or GEN_STEPS
        W, H = self._size

        # Preprocess source image
        img = ImageOps.exif_transpose(src_image).convert("RGB").resize((W, H), Image.LANCZOS)
        generator = torch.Generator(device="cuda").manual_seed(int(seed))

        kw = dict(
            prompt=[prompt],
            negative_prompt=[NEGATIVE_PROMPT],
            image=[img],
            strength=strength,
            guidance_scale=guidance,
            num_inference_steps=steps,
            generator=generator,
        )

        if mode == "inpaint":
            kw["mask_image"] = [make_mask(W, H, seed)]

        def _call_pipe():
            pipe = self._inp if mode == "inpaint" else self._i2i
            return pipe(**kw).images[0]

        try:
            result_img = _call_pipe()
            return result_img, self._name
        except torch.cuda.OutOfMemoryError:
            free_gpu()
            # Step 1: if on SDXL with model offload, escalate to sequential offload
            if self._name == "sdxl" and self._offload_mode != "sequential":
                logger.warning("SDXL OOM detected during inference -> escalating to sequential_cpu_offload")
                self.load(sequential=True)
                return self.generate(src_image, mode, prompt, strength, seed, guidance, steps)

            # Step 2: if already sequential or OOMs again, fall back to SD 1.5
            if self._name == "sdxl":
                logger.warning("SDXL OOM with sequential offload -> falling back to Stable Diffusion 1.5")
                self.load(force_sd15=True)
                return self.generate(src_image, mode, prompt, strength, seed, guidance, steps)

            raise


# Module singleton
generator_manager = GeneratorManager()
