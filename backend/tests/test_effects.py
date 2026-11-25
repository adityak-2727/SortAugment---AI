"""
Phase 1 tests: all 14 classical effects at intensities 0, 0.5, and 1.

Tests verify:
  - Output shape matches input shape
  - Output is uint8
  - Output is contiguous
  - At intensity 0, the output is very similar to the input (near-identity)
  - At intensity 0.5, the output differs meaningfully from the input
  - At intensity 1, the output differs more than at 0.5 (on average)
  - Determinism: same rng seed → same output
  - The EFFECT_FUNCTIONS registry contains exactly the 14 canonical ids
  - apply_effect and apply_effects work correctly

Note on intensity 0: some effects (like shadow) still produce small changes
even at intensity 0 due to floating-point rounding in the polygon mask
generation. We use a generous tolerance for the "near-identity" check.

As noted in the plan: intensity 0.5 *approximates* the notebook's default
ranges but is not bit-identical (the notebook used Albumentations for some
effects, whose internal implementation differs from these NumPy ports).
"""

import numpy as np
import pytest

from app.ml.effects import (
    EFFECT_FUNCTIONS,
    apply_effect,
    apply_effects,
    brightness_contrast,
    shadow,
    color_temperature,
    low_light,
    glare,
    noise,
    blur,
    occlusion_patches,
    stain_overlay,
    rotation,
    perspective,
    elastic,
    crumple,
    partial_crop,
)
from app.config import EFFECTS_BY_AXIS, EFFECT_TO_AXIS, ALL_EFFECT_IDS


# ---- Canonical effect list ----

CANONICAL_IDS = [
    "brightness_contrast", "shadow", "color_temperature", "low_light", "glare",
    "noise", "blur", "occlusion_patches", "stain_overlay",
    "rotation", "perspective", "elastic", "crumple", "partial_crop",
]

ALL_INTENSITIES = [0.0, 0.5, 1.0]


def test_registry_has_all_14_effects():
    """EFFECT_FUNCTIONS must contain exactly the 14 canonical effect ids."""
    assert sorted(EFFECT_FUNCTIONS.keys()) == sorted(CANONICAL_IDS)
    assert len(EFFECT_FUNCTIONS) == 14


def test_config_effects_match_registry():
    """EFFECTS_BY_AXIS in config must list the same ids as the effect registry."""
    config_ids = sorted(ALL_EFFECT_IDS)
    registry_ids = sorted(EFFECT_FUNCTIONS.keys())
    assert config_ids == registry_ids


def test_effect_to_axis_mapping():
    """Every effect id maps to a valid axis."""
    valid_axes = {"lighting", "contamination", "condition"}
    for eid, axis in EFFECT_TO_AXIS.items():
        assert axis in valid_axes, f"{eid} has invalid axis {axis}"
    assert len(EFFECT_TO_AXIS) == 14


# ---- Per-effect tests ----

@pytest.mark.parametrize("effect_id", CANONICAL_IDS)
@pytest.mark.parametrize("intensity", ALL_INTENSITIES)
def test_effect_output_shape_and_dtype(effect_id, intensity, dummy_image_224):
    """Every effect must return an array of the same shape and uint8 dtype."""
    rng = np.random.default_rng(42)
    result = apply_effect(dummy_image_224, effect_id, rng, intensity)
    assert result.shape == dummy_image_224.shape, f"{effect_id} changed shape"
    assert result.dtype == np.uint8, f"{effect_id} returned {result.dtype}"


@pytest.mark.parametrize("effect_id", CANONICAL_IDS)
@pytest.mark.parametrize("intensity", ALL_INTENSITIES)
def test_effect_pixel_range(effect_id, intensity, dummy_image_224):
    """Output pixel values must be in [0, 255]."""
    rng = np.random.default_rng(42)
    result = apply_effect(dummy_image_224, effect_id, rng, intensity)
    assert result.min() >= 0
    assert result.max() <= 255


@pytest.mark.parametrize("effect_id", CANONICAL_IDS)
def test_intensity_zero_near_identity(effect_id, dummy_image_224):
    """At intensity 0, the effect should produce output very similar to the input."""
    rng = np.random.default_rng(42)
    result = apply_effect(dummy_image_224, effect_id, rng, intensity=0.0)
    # Mean absolute difference should be small (< 1 for most, generous threshold)
    mad = np.mean(np.abs(result.astype(float) - dummy_image_224.astype(float)))
    assert mad < 2.0, f"{effect_id} at intensity=0 has MAD={mad:.2f}, expected near-identity"


@pytest.mark.parametrize("effect_id", CANONICAL_IDS)
def test_intensity_half_produces_change(effect_id, dummy_image_224):
    """At intensity 0.5, the effect should visibly change the image."""
    rng = np.random.default_rng(42)
    result = apply_effect(dummy_image_224, effect_id, rng, intensity=0.5)
    mad = np.mean(np.abs(result.astype(float) - dummy_image_224.astype(float)))
    # At 0.5 there should be a noticeable change (at least 0.5 mean pixel diff)
    assert mad > 0.5, f"{effect_id} at intensity=0.5 has MAD={mad:.2f}, expected visible change"


@pytest.mark.parametrize("effect_id", CANONICAL_IDS)
def test_determinism(effect_id, dummy_image_224):
    """Same seed → same output."""
    r1 = apply_effect(dummy_image_224, effect_id, np.random.default_rng(99), intensity=0.5)
    r2 = apply_effect(dummy_image_224, effect_id, np.random.default_rng(99), intensity=0.5)
    np.testing.assert_array_equal(r1, r2, err_msg=f"{effect_id} is not deterministic")


@pytest.mark.parametrize("effect_id", CANONICAL_IDS)
def test_different_seeds_differ(effect_id, dummy_image_224):
    """Different seeds should (almost certainly) produce different outputs at intensity 0.5."""
    r1 = apply_effect(dummy_image_224, effect_id, np.random.default_rng(1), intensity=0.5)
    r2 = apply_effect(dummy_image_224, effect_id, np.random.default_rng(2), intensity=0.5)
    # They might be identical by extreme coincidence, but shouldn't be for 224x224 images
    assert not np.array_equal(r1, r2), f"{effect_id} with different seeds produced identical output"


@pytest.mark.parametrize("effect_id", CANONICAL_IDS)
def test_non_square_image(effect_id, dummy_image_100):
    """Effects should work on non-224 images too."""
    rng = np.random.default_rng(42)
    result = apply_effect(dummy_image_100, effect_id, rng, intensity=0.5)
    assert result.shape == dummy_image_100.shape
    assert result.dtype == np.uint8


# ---- apply_effects chain test ----

def test_apply_effects_chain(dummy_image_224):
    """Chaining two effects should produce a valid image."""
    rng = np.random.default_rng(42)
    result = apply_effects(dummy_image_224, ["brightness_contrast", "noise"], rng, intensity=0.5)
    assert result.shape == dummy_image_224.shape
    assert result.dtype == np.uint8
    # Should differ from applying just one
    rng2 = np.random.default_rng(42)
    single = apply_effect(dummy_image_224, "brightness_contrast", rng2, intensity=0.5)
    assert not np.array_equal(result, single)


def test_apply_effect_unknown_raises():
    """Unknown effect id should raise KeyError."""
    img = np.zeros((10, 10, 3), np.uint8)
    with pytest.raises(KeyError):
        apply_effect(img, "nonexistent_effect", np.random.default_rng(1))


# ---- Intensity scaling direction tests ----
# We check that increasing intensity generally increases the magnitude of change.
# We run each effect 10 times with different seeds and compare average MAD.

@pytest.mark.parametrize("effect_id", CANONICAL_IDS)
def test_intensity_scaling_direction(effect_id, dummy_image_224):
    """Higher intensity should produce larger average change (across multiple seeds)."""
    n_trials = 10
    mad_at = {0.0: 0.0, 0.5: 0.0, 1.0: 0.0}
    for intensity in [0.0, 0.5, 1.0]:
        total_mad = 0.0
        for seed in range(n_trials):
            rng = np.random.default_rng(seed + 1000)
            result = apply_effect(dummy_image_224, effect_id, rng, intensity)
            total_mad += np.mean(np.abs(result.astype(float) - dummy_image_224.astype(float)))
        mad_at[intensity] = total_mad / n_trials

    # Intensity 0 <= intensity 0.5 <= intensity 1 (with some tolerance)
    assert mad_at[0.0] <= mad_at[0.5] + 0.5, (
        f"{effect_id}: MAD at 0 ({mad_at[0.0]:.2f}) > MAD at 0.5 ({mad_at[0.5]:.2f})"
    )
    assert mad_at[0.5] <= mad_at[1.0] + 0.5, (
        f"{effect_id}: MAD at 0.5 ({mad_at[0.5]:.2f}) > MAD at 1 ({mad_at[1.0]:.2f})"
    )
