"""
Shared test fixtures for SortAugment backend tests.
"""

import sys
from pathlib import Path

import numpy as np
import pytest

# Ensure the backend package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


@pytest.fixture
def dummy_image_224():
    """A 224x224 RGB uint8 image with varied pixel values (not uniform)."""
    rng = np.random.default_rng(42)
    return rng.integers(0, 256, (224, 224, 3), dtype=np.uint8)


@pytest.fixture
def dummy_image_100():
    """A 100x100 RGB uint8 image (non-square test)."""
    rng = np.random.default_rng(99)
    return rng.integers(0, 256, (100, 100, 3), dtype=np.uint8)


@pytest.fixture
def dummy_batch_224():
    """A batch of 4 different 224x224 RGB uint8 images."""
    rng = np.random.default_rng(7)
    return rng.integers(0, 256, (4, 224, 224, 3), dtype=np.uint8)


@pytest.fixture
def fixed_rng():
    """A reproducible NumPy RNG."""
    return np.random.default_rng(12345)
