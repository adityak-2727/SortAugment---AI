"""
Phase 1 tests: classifier loading, prediction, class order, probability sums.

Tests verify:
  - The model loads from best_model.pt without error
  - Class names match config.json order
  - predict_proba returns shape (N, 6) with float32
  - Probabilities sum to ~1.0 for each image
  - predict_one returns label, confidence, and probs dict
  - Determinism: same input → same output
  - Single-image input (H,W,3) works as well as batch (N,H,W,3)
"""

import numpy as np
import pytest
import torch

from app.config import CLASS_NAMES, NUM_CLASSES, IMG_SIZE, MODEL_PATH
from app.ml.classifier import Classifier, IMAGENET_MEAN, IMAGENET_STD


@pytest.fixture(scope="module")
def clf():
    """Load the classifier once for all tests in this module."""
    c = Classifier()
    c.load(device="cpu")
    return c


class TestClassifierLoading:
    def test_model_loads(self, clf):
        """Model should load without error and report as loaded."""
        assert clf.loaded is True
        assert clf.model is not None

    def test_model_is_eval_mode(self, clf):
        """Model must be in eval mode (no dropout, frozen batchnorm)."""
        assert not clf.model.training

    def test_model_on_expected_device(self, clf):
        """Model should be on CPU for these tests."""
        assert clf.device == torch.device("cpu")

    def test_checkpoint_exists(self):
        """best_model.pt must exist."""
        assert MODEL_PATH.exists(), f"Checkpoint not found at {MODEL_PATH}"


class TestPredictProba:
    def test_output_shape_single(self, clf):
        """Single image (H,W,3) → probs shape (1, NUM_CLASSES)."""
        img = np.random.default_rng(1).integers(0, 256, (IMG_SIZE, IMG_SIZE, 3), dtype=np.uint8)
        probs = clf.predict_proba(img)
        assert probs.shape == (1, NUM_CLASSES)

    def test_output_shape_batch(self, clf):
        """Batch of N images → probs shape (N, NUM_CLASSES)."""
        imgs = np.random.default_rng(2).integers(0, 256, (5, IMG_SIZE, IMG_SIZE, 3), dtype=np.uint8)
        probs = clf.predict_proba(imgs)
        assert probs.shape == (5, NUM_CLASSES)

    def test_output_dtype(self, clf):
        """Probabilities should be float32 (or at least float)."""
        img = np.random.default_rng(3).integers(0, 256, (IMG_SIZE, IMG_SIZE, 3), dtype=np.uint8)
        probs = clf.predict_proba(img)
        assert probs.dtype == np.float32 or np.issubdtype(probs.dtype, np.floating)

    def test_probs_sum_to_one(self, clf):
        """Each row of probabilities should sum to ~1.0."""
        imgs = np.random.default_rng(4).integers(0, 256, (3, IMG_SIZE, IMG_SIZE, 3), dtype=np.uint8)
        probs = clf.predict_proba(imgs)
        for i in range(len(probs)):
            assert abs(probs[i].sum() - 1.0) < 1e-4, f"Row {i} sums to {probs[i].sum()}"

    def test_probs_non_negative(self, clf):
        """All probabilities must be >= 0."""
        img = np.random.default_rng(5).integers(0, 256, (IMG_SIZE, IMG_SIZE, 3), dtype=np.uint8)
        probs = clf.predict_proba(img)
        assert (probs >= 0).all()

    def test_probs_at_most_one(self, clf):
        """All probabilities must be <= 1."""
        img = np.random.default_rng(6).integers(0, 256, (IMG_SIZE, IMG_SIZE, 3), dtype=np.uint8)
        probs = clf.predict_proba(img)
        assert (probs <= 1.0 + 1e-6).all()

    def test_determinism(self, clf):
        """Same input must produce the same probabilities."""
        img = np.random.default_rng(7).integers(0, 256, (IMG_SIZE, IMG_SIZE, 3), dtype=np.uint8)
        p1 = clf.predict_proba(img)
        p2 = clf.predict_proba(img)
        np.testing.assert_array_almost_equal(p1, p2, decimal=6)


class TestPredictOne:
    def test_predict_one_returns_dict(self, clf):
        """predict_one should return a dict with label, confidence, probs."""
        img = np.random.default_rng(10).integers(0, 256, (IMG_SIZE, IMG_SIZE, 3), dtype=np.uint8)
        result = clf.predict_one(img)
        assert "label" in result
        assert "confidence" in result
        assert "probs" in result

    def test_predict_one_label_in_class_names(self, clf):
        """The predicted label must be one of the known classes."""
        img = np.random.default_rng(11).integers(0, 256, (IMG_SIZE, IMG_SIZE, 3), dtype=np.uint8)
        result = clf.predict_one(img)
        assert result["label"] in CLASS_NAMES

    def test_predict_one_confidence_matches(self, clf):
        """Confidence must equal the probability of the predicted class."""
        img = np.random.default_rng(12).integers(0, 256, (IMG_SIZE, IMG_SIZE, 3), dtype=np.uint8)
        result = clf.predict_one(img)
        assert abs(result["confidence"] - result["probs"][result["label"]]) < 1e-6

    def test_predict_one_probs_has_all_classes(self, clf):
        """The probs dict must have an entry for every class."""
        img = np.random.default_rng(13).integers(0, 256, (IMG_SIZE, IMG_SIZE, 3), dtype=np.uint8)
        result = clf.predict_one(img)
        assert set(result["probs"].keys()) == set(CLASS_NAMES)

    def test_predict_one_probs_sum_to_one(self, clf):
        """The probs dict values should sum to ~1.0."""
        img = np.random.default_rng(14).integers(0, 256, (IMG_SIZE, IMG_SIZE, 3), dtype=np.uint8)
        result = clf.predict_one(img)
        total = sum(result["probs"].values())
        assert abs(total - 1.0) < 1e-4


class TestClassOrder:
    def test_class_names_match_config(self):
        """Class names constant must match config.json."""
        expected = ["cardboard", "glass", "metal", "paper", "plastic", "trash"]
        assert CLASS_NAMES == expected

    def test_num_classes(self):
        """NUM_CLASSES must be 6."""
        assert NUM_CLASSES == 6

    def test_class_order_in_probs(self, clf):
        """
        predict_proba column order must match CLASS_NAMES.
        We verify by checking that predict_one's argmax matches the probs dict.
        """
        img = np.random.default_rng(20).integers(0, 256, (IMG_SIZE, IMG_SIZE, 3), dtype=np.uint8)
        probs_array = clf.predict_proba(img)[0]
        result = clf.predict_one(img)
        # The index of the max probability in the array should correspond
        # to the class name in CLASS_NAMES
        top_idx = int(np.argmax(probs_array))
        assert CLASS_NAMES[top_idx] == result["label"]


class TestNotLoaded:
    def test_predict_before_load_raises(self):
        """Calling predict_proba before load() should raise RuntimeError."""
        c = Classifier()
        img = np.zeros((IMG_SIZE, IMG_SIZE, 3), np.uint8)
        with pytest.raises(RuntimeError, match="not loaded"):
            c.predict_proba(img)


class TestImageNetConstants:
    def test_mean_shape(self):
        assert IMAGENET_MEAN.shape == (1, 3, 1, 1)

    def test_std_shape(self):
        assert IMAGENET_STD.shape == (1, 3, 1, 1)

    def test_mean_values(self):
        expected = [0.485, 0.456, 0.406]
        for i, v in enumerate(expected):
            assert abs(IMAGENET_MEAN[0, i, 0, 0].item() - v) < 1e-6

    def test_std_values(self):
        expected = [0.229, 0.224, 0.225]
        for i, v in enumerate(expected):
            assert abs(IMAGENET_STD[0, i, 0, 0].item() - v) < 1e-6
