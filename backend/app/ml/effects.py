"""
Classical image augmentation effects for SortAugment AI.

Ported from the notebook's Section 4 (NumPy / OpenCV implementations).
Every function has the signature:
    def effect(img: np.ndarray, rng: np.random.Generator, intensity: float = 0.5) -> np.ndarray

- img:       RGB uint8 array of shape (H, W, 3).
- rng:       NumPy random generator for reproducibility.
- intensity: float in [0, 1].  0 → identity / minimal visible change;
             0.5 → reproduces the notebook's default random ranges (not bit-identical
             because the notebook used Albumentations for some effects, whose internals
             differ from the pure NumPy ports here); 1 → strong / doubled effect.

Intensity scaling
-----------------
For each effect, the notebook uses a fixed random range [lo, hi] for each parameter.
Let that range be the "default".  We define:

    effective_range(intensity) = lerp(identity_value, default_range, 2 * intensity)
                                 for intensity in [0, 0.5]
    effective_range(intensity) = lerp(default_range, max_range, 2 * (intensity - 0.5))
                                 for intensity in (0.5, 1]

This means:
  - intensity 0   →  identity (no change or minimal)
  - intensity 0.5 →  notebook default range
  - intensity 1   →  maximum (roughly 2x the notebook)

Helper `_scale` implements this per-parameter.
"""

import cv2
import numpy as np


# ---------------------------------------------------------------------------
#  Helpers
# ---------------------------------------------------------------------------

def _scale(intensity: float, at0: float, at05: float, at1: float) -> float:
    """
    Linearly interpolate a parameter value based on intensity.
    at0  = value at intensity 0 (identity)
    at05 = value at intensity 0.5 (notebook default)
    at1  = value at intensity 1 (maximum)
    """
    intensity = float(np.clip(intensity, 0.0, 1.0))
    if intensity <= 0.5:
        t = intensity / 0.5
        return at0 + (at05 - at0) * t
    else:
        t = (intensity - 0.5) / 0.5
        return at05 + (at1 - at05) * t


def _scale_range(intensity: float,
                 lo0: float, hi0: float,
                 lo05: float, hi05: float,
                 lo1: float, hi1: float) -> tuple[float, float]:
    """Scale both ends of a uniform-random range."""
    return _scale(intensity, lo0, lo05, lo1), _scale(intensity, hi0, hi05, hi1)


def smooth_field(h: int, w: int, scale: int, rng: np.random.Generator) -> np.ndarray:
    """Low-frequency random field in [0,1]: random noise on a coarse grid, blown up smoothly."""
    gh, gw = max(2, h // scale), max(2, w // scale)
    f = cv2.resize(rng.random((gh, gw)).astype(np.float32), (w, h), interpolation=cv2.INTER_CUBIC)
    f = (f - f.min()) / (f.max() - f.min() + 1e-6)
    return f


def clip_u8(x: np.ndarray) -> np.ndarray:
    return np.clip(x, 0, 255).astype(np.uint8)


# ---------------------------------------------------------------------------
#  LIGHTING effects
# ---------------------------------------------------------------------------

def brightness_contrast(img: np.ndarray, rng: np.random.Generator, intensity: float = 0.5) -> np.ndarray:
    """
    Random brightness and contrast adjustment.
    Notebook default: contrast a ∈ [0.6, 1.4], brightness b ∈ [-50, 50].
    Intensity 0: a=1, b=0 (identity).  Intensity 1: a ∈ [0.2, 1.8], b ∈ [-100, 100].
    """
    a_lo, a_hi = _scale_range(intensity, 1.0, 1.0, 0.6, 1.4, 0.2, 1.8)
    b_lo, b_hi = _scale_range(intensity, 0.0, 0.0, -50.0, 50.0, -100.0, 100.0)
    a = rng.uniform(a_lo, a_hi)
    b = rng.uniform(b_lo, b_hi)
    return clip_u8((img.astype(np.float32) - 128) * a + 128 + b)


def shadow(img: np.ndarray, rng: np.random.Generator, intensity: float = 0.5) -> np.ndarray:
    """
    Random polygonal shadow across the image.
    Notebook default: darkening factor ∈ [0.3, 0.6].
    Intensity 0: factor=0 (no shadow).  Intensity 1: factor ∈ [0.5, 0.9].
    """
    h, w = img.shape[:2]
    pts = np.array([
        [rng.uniform(0, w), 0],
        [rng.uniform(0, w), 0],
        [rng.uniform(0, w), h],
        [rng.uniform(0, w), h],
    ], np.int32)
    mask = np.zeros((h, w), np.float32)
    cv2.fillPoly(mask, [pts], 1.0)
    mask = cv2.GaussianBlur(mask, (0, 0), max(h, w) * 0.03)
    f_lo, f_hi = _scale_range(intensity, 0.0, 0.0, 0.3, 0.6, 0.5, 0.9)
    factor = rng.uniform(f_lo, f_hi)
    return clip_u8(img.astype(np.float32) * (1 - factor * mask[..., None]))


def color_temperature(img: np.ndarray, rng: np.random.Generator, intensity: float = 0.5) -> np.ndarray:
    """
    Warm (orange) or cold (blue) lamp: scale red and blue channels in opposite directions.
    Notebook default: k ∈ [-0.28, 0.28].
    Intensity 0: k=0 (identity).  Intensity 1: k ∈ [-0.56, 0.56].
    """
    k_lo, k_hi = _scale_range(intensity, 0.0, 0.0, -0.28, 0.28, -0.56, 0.56)
    k = rng.uniform(k_lo, k_hi)
    out = img.astype(np.float32)
    out[..., 0] *= 1 + k   # Red channel
    out[..., 2] *= 1 - k   # Blue channel
    return clip_u8(out)


def low_light(img: np.ndarray, rng: np.random.Generator, intensity: float = 0.5) -> np.ndarray:
    """
    Dim scene: gamma curve + overall darkening + a little sensor noise.
    Notebook default: gamma ∈ [1.6, 2.8], darken ∈ [0.45, 0.8], noise σ ∈ [2, 6].
    Intensity 0: gamma=1, darken=1, noise=0 (identity).
    Intensity 1: gamma ∈ [2.4, 4.2], darken ∈ [0.25, 0.55], noise σ ∈ [4, 12].
    """
    g_lo, g_hi = _scale_range(intensity, 1.0, 1.0, 1.6, 2.8, 2.4, 4.2)
    d_lo, d_hi = _scale_range(intensity, 1.0, 1.0, 0.45, 0.8, 0.25, 0.55)
    n_lo, n_hi = _scale_range(intensity, 0.0, 0.0, 2.0, 6.0, 4.0, 12.0)
    gamma = rng.uniform(g_lo, g_hi)
    darken = rng.uniform(d_lo, d_hi)
    noise_sigma = rng.uniform(n_lo, n_hi)
    x = (img.astype(np.float32) / 255.0) ** gamma * 255.0 * darken
    if noise_sigma > 0:
        x = x + rng.normal(0, noise_sigma, img.shape)
    return clip_u8(x)


def glare(img: np.ndarray, rng: np.random.Generator, intensity: float = 0.5) -> np.ndarray:
    """
    A bright specular hot-spot, like a lamp reflecting off a shiny surface.
    Notebook default: spot intensity ∈ [0.6, 1.0].
    Intensity 0: spot_intensity=0 (identity).  Intensity 1: spot_intensity ∈ [0.9, 1.5].
    """
    h, w = img.shape[:2]
    cx, cy = rng.uniform(0.2, 0.8) * w, rng.uniform(0.2, 0.8) * h
    rx, ry = rng.uniform(0.08, 0.25) * w, rng.uniform(0.08, 0.25) * h
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    spot = np.exp(-(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2))
    s_lo, s_hi = _scale_range(intensity, 0.0, 0.0, 0.6, 1.0, 0.9, 1.5)
    spot_intensity = rng.uniform(s_lo, s_hi)
    return clip_u8(img.astype(np.float32) + 255.0 * spot[..., None] * spot_intensity)


# ---------------------------------------------------------------------------
#  CONTAMINATION effects
# ---------------------------------------------------------------------------

def noise(img: np.ndarray, rng: np.random.Generator, intensity: float = 0.5) -> np.ndarray:
    """
    Gaussian noise (sensor noise / dirty lens).
    Notebook default: σ ∈ [8, 35].
    Intensity 0: σ=0 (identity).  Intensity 1: σ ∈ [16, 70].
    """
    s_lo, s_hi = _scale_range(intensity, 0.0, 0.0, 8.0, 35.0, 16.0, 70.0)
    sigma = rng.uniform(s_lo, s_hi)
    if sigma <= 0:
        return img.copy()
    return clip_u8(img.astype(np.float32) + rng.normal(0, sigma, img.shape))


def blur(img: np.ndarray, rng: np.random.Generator, intensity: float = 0.5) -> np.ndarray:
    """
    Gaussian or motion blur.
    Notebook default: Gaussian k ∈ {3,5,7,9}, motion L ∈ [5,15].
    Intensity 0: no blur (identity).  Intensity 1: Gaussian k ∈ {5,7,9,11,13,15}, motion L ∈ [10,25].
    """
    if intensity <= 0.001:
        return img.copy()

    # Scale available kernel sizes
    if rng.random() < 0.5:
        # Gaussian blur
        # At 0.5: choices [3,5,7,9].  At 0: k=1.  At 1: choices [5,7,9,11,13,15]
        min_k = int(round(_scale(intensity, 1, 3, 5)))
        max_k = int(round(_scale(intensity, 1, 9, 15)))
        # Ensure odd
        min_k = max(1, min_k | 1)
        max_k = max(min_k, max_k | 1)
        choices = list(range(min_k, max_k + 1, 2))
        k = int(rng.choice(choices))
        if k <= 1:
            return img.copy()
        return cv2.GaussianBlur(img, (k, k), 0)
    else:
        # Motion blur
        l_lo, l_hi = _scale_range(intensity, 1.0, 1.0, 5.0, 15.0, 10.0, 25.0)
        L = int(rng.integers(max(1, int(l_lo)), max(2, int(l_hi))))
        if L <= 1:
            return img.copy()
        ang = rng.uniform(0, 180)
        ker = np.zeros((L, L), np.float32)
        ker[L // 2, :] = 1.0
        M = cv2.getRotationMatrix2D((L / 2 - 0.5, L / 2 - 0.5), ang, 1.0)
        ker = cv2.warpAffine(ker, M, (L, L))
        ker /= ker.sum() + 1e-6
        return cv2.filter2D(img, -1, ker)


def occlusion_patches(img: np.ndarray, rng: np.random.Generator, intensity: float = 0.5) -> np.ndarray:
    """
    Random patches that hide part of the item (other waste, a hand, a label...).
    Notebook default: 1-4 patches, patch size ∈ [0.08, 0.28] * dim.
    Intensity 0: 0 patches (identity).  Intensity 1: 2-8 patches, size ∈ [0.12, 0.40] * dim.
    """
    h, w = img.shape[:2]
    n_lo, n_hi = _scale_range(intensity, 0.0, 0.0, 1.0, 4.0, 2.0, 8.0)
    n_patches = int(rng.integers(max(0, int(n_lo)), max(1, int(n_hi)) + 1))
    if n_patches == 0:
        return img.copy()

    sz_lo = _scale(intensity, 0.0, 0.08, 0.12)
    sz_hi = _scale(intensity, 0.0, 0.28, 0.40)

    out = img.copy()
    for _ in range(n_patches):
        pw = int(rng.uniform(sz_lo, sz_hi) * w)
        ph = int(rng.uniform(sz_lo, sz_hi) * h)
        pw, ph = max(1, pw), max(1, ph)
        x0 = int(rng.uniform(0, max(1, w - pw)))
        y0 = int(rng.uniform(0, max(1, h - ph)))
        color = tuple(int(c) for c in rng.integers(20, 200, 3))
        if rng.random() < 0.5:
            cv2.rectangle(out, (x0, y0), (x0 + pw, y0 + ph), color, -1)
        else:
            cv2.ellipse(out, (x0 + pw // 2, y0 + ph // 2), (pw // 2, ph // 2),
                        float(rng.uniform(0, 180)), 0, 360, color, -1)
    return out


# Stain colors from the notebook: mud, oil, grease, coffee, dust
STAIN_COLORS = [(90, 60, 30), (30, 30, 30), (170, 150, 60), (80, 50, 30), (110, 100, 90)]


def stain_overlay(img: np.ndarray, rng: np.random.Generator, intensity: float = 0.5) -> np.ndarray:
    """
    Soft irregular dirty blobs blended over the image.
    Notebook default: alpha ∈ [0.4, 0.75], threshold ∈ [0.62, 0.82].
    Intensity 0: alpha=0 (identity).  Intensity 1: alpha ∈ [0.6, 1.0], threshold ∈ [0.50, 0.70].
    """
    h, w = img.shape[:2]
    f = smooth_field(h, w, 48, rng)
    thr_lo, thr_hi = _scale_range(intensity, 0.95, 0.95, 0.62, 0.82, 0.50, 0.70)
    thr = rng.uniform(thr_lo, thr_hi)
    mask = np.clip((f - thr) / 0.10, 0, 1)
    mask = cv2.GaussianBlur(mask, (0, 0), 2.0)[..., None]
    color = np.array(STAIN_COLORS[int(rng.integers(len(STAIN_COLORS)))], np.float32)
    a_lo, a_hi = _scale_range(intensity, 0.0, 0.0, 0.4, 0.75, 0.6, 1.0)
    alpha = rng.uniform(a_lo, a_hi)
    return clip_u8(img.astype(np.float32) * (1 - alpha * mask) + color * alpha * mask)


# ---------------------------------------------------------------------------
#  CONDITION effects
# ---------------------------------------------------------------------------

def rotation(img: np.ndarray, rng: np.random.Generator, intensity: float = 0.5) -> np.ndarray:
    """
    Random rotation.
    Notebook default: angle ∈ [-45, 45].
    Intensity 0: angle=0 (identity).  Intensity 1: angle ∈ [-90, 90].
    """
    a_lo, a_hi = _scale_range(intensity, 0.0, 0.0, -45.0, 45.0, -90.0, 90.0)
    angle = rng.uniform(a_lo, a_hi)
    h, w = img.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    return cv2.warpAffine(img, M, (w, h), borderMode=cv2.BORDER_REFLECT_101)


def perspective(img: np.ndarray, rng: np.random.Generator, intensity: float = 0.5) -> np.ndarray:
    """
    Random perspective warp.
    Notebook default: displacement s ∈ [0.05, 0.15] * min(h,w).
    Intensity 0: s=0 (identity).  Intensity 1: s ∈ [0.10, 0.30] * min(h,w).
    """
    h, w = img.shape[:2]
    s_lo, s_hi = _scale_range(intensity, 0.0, 0.0, 0.05, 0.15, 0.10, 0.30)
    s = rng.uniform(s_lo, s_hi) * min(h, w)
    if s < 0.5:
        return img.copy()
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    dst = src + rng.uniform(-s, s, src.shape).astype(np.float32)
    M = cv2.getPerspectiveTransform(src, dst)
    return cv2.warpPerspective(img, M, (w, h), borderMode=cv2.BORDER_REFLECT_101)


def elastic(img: np.ndarray, rng: np.random.Generator, intensity: float = 0.5) -> np.ndarray:
    """
    Smooth random warp of the pixel grid (like a deformed, soft object).
    Notebook default: amplitude ∈ [0.02, 0.05] * min(h,w).
    Intensity 0: amp=0 (identity).  Intensity 1: amp ∈ [0.04, 0.10] * min(h,w).
    """
    h, w = img.shape[:2]
    a_lo, a_hi = _scale_range(intensity, 0.0, 0.0, 0.02, 0.05, 0.04, 0.10)
    amp = rng.uniform(a_lo, a_hi) * min(h, w)
    if amp < 0.5:
        return img.copy()
    dx = (smooth_field(h, w, 24, rng) - 0.5) * 2 * amp
    dy = (smooth_field(h, w, 24, rng) - 0.5) * 2 * amp
    gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    return cv2.remap(img, gx + dx, gy + dy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT_101)


def crumple(img: np.ndarray, rng: np.random.Generator, intensity: float = 0.5) -> np.ndarray:
    """
    Crumple-like look: a strong smooth warp plus soft crease shading.
    Notebook default: warp amp ∈ [0.04, 0.08] * min(h,w), shade ∈ [0.15, 0.35].
    Intensity 0: no warp, no shade (identity).  Intensity 1: warp ∈ [0.08, 0.16], shade ∈ [0.25, 0.55].
    """
    h, w = img.shape[:2]
    # Warp phase
    wa_lo, wa_hi = _scale_range(intensity, 0.0, 0.0, 0.04, 0.08, 0.08, 0.16)
    warp_amp = rng.uniform(wa_lo, wa_hi) * min(h, w)
    if warp_amp < 0.5:
        warped = img.copy()
    else:
        dx = (smooth_field(h, w, 24, rng) - 0.5) * 2 * warp_amp
        dy = (smooth_field(h, w, 24, rng) - 0.5) * 2 * warp_amp
        gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
        warped = cv2.remap(img, gx + dx, gy + dy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT_101)

    # Shading phase
    sh_lo, sh_hi = _scale_range(intensity, 0.0, 0.0, 0.15, 0.35, 0.25, 0.55)
    shade_strength = rng.uniform(sh_lo, sh_hi)
    if shade_strength < 0.001:
        return warped

    field = cv2.GaussianBlur(smooth_field(h, w, 12, rng), (0, 0), 3)
    gy_f, gx_f = np.gradient(field)
    shade = 0.7 * gx_f + 0.7 * gy_f
    shade = np.clip(shade / (np.percentile(np.abs(shade), 99) + 1e-6), -1, 1)
    return clip_u8(warped.astype(np.float32) * (1 + shade_strength * shade[..., None]))


def partial_crop(img: np.ndarray, rng: np.random.Generator, intensity: float = 0.5) -> np.ndarray:
    """
    Only part of the item is in view: crop a fraction and scale back up.
    Notebook default: frac ∈ [0.55, 0.85].
    Intensity 0: frac=1 (identity).  Intensity 1: frac ∈ [0.30, 0.60].
    """
    h, w = img.shape[:2]
    f_lo, f_hi = _scale_range(intensity, 1.0, 1.0, 0.55, 0.85, 0.30, 0.60)
    frac = rng.uniform(f_lo, f_hi)
    if frac >= 0.999:
        return img.copy()
    ch, cw = max(1, int(h * frac)), max(1, int(w * frac))
    y0 = int(rng.uniform(0, max(1, h - ch)))
    x0 = int(rng.uniform(0, max(1, w - cw)))
    return cv2.resize(img[y0:y0 + ch, x0:x0 + cw], (w, h), interpolation=cv2.INTER_LINEAR)


# ---------------------------------------------------------------------------
#  Registry: effect_id -> function
# ---------------------------------------------------------------------------

EFFECT_FUNCTIONS: dict[str, callable] = {
    # lighting
    "brightness_contrast": brightness_contrast,
    "shadow":              shadow,
    "color_temperature":   color_temperature,
    "low_light":           low_light,
    "glare":               glare,
    # contamination
    "noise":               noise,
    "blur":                blur,
    "occlusion_patches":   occlusion_patches,
    "stain_overlay":       stain_overlay,
    # condition
    "rotation":            rotation,
    "perspective":         perspective,
    "elastic":             elastic,
    "crumple":             crumple,
    "partial_crop":        partial_crop,
}


def apply_effect(img: np.ndarray, effect_id: str, rng: np.random.Generator,
                 intensity: float = 0.5) -> np.ndarray:
    """Apply a single named effect. Raises KeyError for unknown effect ids."""
    return EFFECT_FUNCTIONS[effect_id](img, rng, intensity)


def apply_effects(img: np.ndarray, effect_ids: list[str], rng: np.random.Generator,
                  intensity: float = 0.5) -> np.ndarray:
    """Apply a chain of effects in order."""
    out = img
    for eid in effect_ids:
        out = apply_effect(out, eid, rng, intensity)
    return np.ascontiguousarray(out)
