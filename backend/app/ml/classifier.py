"""
ResNet18 classifier for recyclable material classification.

Architecture, preprocessing, and class order match the notebook exactly:
  - torchvision ResNet18 with fc replaced by Linear(512, 6)
  - Input: RGB uint8 images resized to 224×224, normalized with ImageNet mean/std
  - Class order: ["cardboard", "glass", "metal", "paper", "plastic", "trash"]
  - Loaded from best_model.pt with torch.load(..., weights_only=False)

The classifier is a singleton loaded once at startup.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import numpy as np
import torch
import torch.nn as nn
from torchvision import models

from app.config import CLASS_NAMES, NUM_CLASSES, IMG_SIZE, MODEL_PATH

logger = logging.getLogger(__name__)

# ImageNet normalization constants (same as the notebook)
IMAGENET_MEAN = torch.tensor([0.485, 0.456, 0.406]).view(1, 3, 1, 1)
IMAGENET_STD  = torch.tensor([0.229, 0.224, 0.225]).view(1, 3, 1, 1)


class Classifier:
    """Thread-safe singleton wrapper for the ResNet18 recyclable classifier."""

    def __init__(self):
        self.model: Optional[nn.Module] = None
        self.device: torch.device = torch.device("cpu")
        self._loaded = False

    @property
    def loaded(self) -> bool:
        return self._loaded

    def load(self, model_path: Path | str | None = None, device: str | None = None) -> None:
        """
        Load the checkpoint.  Call once at startup.

        Parameters
        ----------
        model_path : path to best_model.pt (defaults to config.MODEL_PATH)
        device     : "cuda", "cpu", or None for auto-detect
        """
        model_path = Path(model_path or MODEL_PATH)
        if device is None:
            device = "cuda" if torch.cuda.is_available() else "cpu"
        self.device = torch.device(device)

        # Build the architecture (must match the notebook's make_model)
        m = models.resnet18(weights=None)
        m.fc = nn.Linear(m.fc.in_features, NUM_CLASSES)   # 512 -> 6

        # Load weights
        ck = torch.load(str(model_path), map_location=self.device, weights_only=False)

        # Validate class names match
        ck_classes = ck.get("class_names", [])
        if ck_classes and list(ck_classes) != CLASS_NAMES:
            raise ValueError(
                f"Checkpoint class_names {ck_classes} do not match config {CLASS_NAMES}"
            )

        m.load_state_dict(ck["state_dict"])
        m.to(self.device)
        m.eval()
        self.model = m
        self._loaded = True

        arch = ck.get("arch", "resnet18")
        img_size = ck.get("img_size", IMG_SIZE)
        logger.info(
            "Classifier loaded: arch=%s, classes=%d, img_size=%d, device=%s",
            arch, NUM_CLASSES, img_size, self.device,
        )

    @torch.no_grad()
    def predict_proba(self, images: np.ndarray) -> np.ndarray:
        """
        Compute class probabilities for a batch of images.

        Parameters
        ----------
        images : uint8 array of shape (N, H, W, 3) where H=W=224.
                 If a single image (H, W, 3) is given, it is expanded.

        Returns
        -------
        probs : float32 array of shape (N, NUM_CLASSES) with softmax probabilities.
                Column order matches CLASS_NAMES.
        """
        if not self._loaded:
            raise RuntimeError("Classifier not loaded. Call load() first.")

        if images.ndim == 3:
            images = images[np.newaxis]

        images = np.ascontiguousarray(images).copy()

        # uint8 (N,H,W,3) -> float (N,3,H,W), ImageNet normalized
        x = torch.from_numpy(images).to(self.device).permute(0, 3, 1, 2).float() / 255.0
        mean = IMAGENET_MEAN.to(self.device)
        std = IMAGENET_STD.to(self.device)
        x = (x - mean) / std

        logits = self.model(x)
        probs = torch.softmax(logits.float(), dim=1).cpu().numpy()
        return probs

    def predict_one(self, image: np.ndarray) -> dict:
        """
        Classify a single image and return a dict with label, confidence, and probs.

        Parameters
        ----------
        image : uint8 array (H, W, 3).

        Returns
        -------
        {"label": str, "confidence": float, "probs": {class_name: float}}
        """
        probs = self.predict_proba(image)[0]  # shape (NUM_CLASSES,)
        top_idx = int(np.argmax(probs))
        return {
            "label": CLASS_NAMES[top_idx],
            "confidence": float(probs[top_idx]),
            "probs": {name: float(p) for name, p in zip(CLASS_NAMES, probs)},
        }


# Module-level singleton
classifier = Classifier()
