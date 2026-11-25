/**
 * Browser Canvas 2D augmentation simulator for mock mode.
 * Applies deterministic visual filters to a user's real uploaded image for all
 * 14 canonical effects across lighting, contamination, and condition axes.
 */

export function createSeededRng(seedValue) {
  let state = (Number(seedValue) || 42) >>> 0;
  if (state === 0) state = 1337;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/**
 * Generates an augmented JPEG data URL from an uploaded image data URL.
 * Returns { dataUrl, params }.
 */
export async function simulateAugmentationOnCanvas({
  sourceDataUrl,
  effect,
  intensity = 0.5,
  rng = Math.random,
}) {
  const img = await loadImageElement(sourceDataUrl);
  const maxDim = 640;
  const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
  const width = Math.max(64, Math.round((img.width || 480) * scale));
  const height = Math.max(64, Math.round((img.height || 360) * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const clamped = Math.max(0.05, Math.min(1, Number(intensity) || 0.5));
  const params = {};

  ctx.fillStyle = '#E6E2D6';
  ctx.fillRect(0, 0, width, height);

  ctx.save();

  switch (effect) {
    case 'brightness_contrast': {
      const sign = rng() > 0.5 ? 1 : -1;
      const brightness = +(1 + sign * clamped * 0.45).toFixed(2);
      const contrast = +(1 + (rng() * 0.6 - 0.25) * clamped).toFixed(2);
      params.brightness = brightness;
      params.contrast = contrast;
      ctx.filter = `brightness(${brightness}) contrast(${contrast})`;
      ctx.drawImage(img, 0, 0, width, height);
      break;
    }

    case 'low_light': {
      const dim = +(1 - clamped * 0.62).toFixed(2);
      const contrast = +(1 + clamped * 0.18).toFixed(2);
      params.brightness = dim;
      params.gamma = +(1 + clamped * 0.7).toFixed(2);
      ctx.filter = `brightness(${dim}) contrast(${contrast}) saturate(0.85)`;
      ctx.drawImage(img, 0, 0, width, height);
      ctx.filter = 'none';
      ctx.fillStyle = `rgba(10, 18, 26, ${(clamped * 0.28).toFixed(2)})`;
      ctx.fillRect(0, 0, width, height);
      break;
    }

    case 'color_temperature': {
      const warm = rng() > 0.45;
      const kelvinShift = Math.round((warm ? 1 : -1) * (800 + clamped * 2200));
      params.kelvin_shift = kelvinShift;
      ctx.drawImage(img, 0, 0, width, height);
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = warm
        ? `rgba(255, 214, 158, ${(0.18 + clamped * 0.35).toFixed(2)})`
        : `rgba(164, 206, 255, ${(0.18 + clamped * 0.35).toFixed(2)})`;
      ctx.fillRect(0, 0, width, height);
      break;
    }

    case 'shadow': {
      const angleDeg = Math.round(rng() * 360);
      const darkness = +(0.25 + clamped * 0.5).toFixed(2);
      params.angle_deg = angleDeg;
      params.opacity = darkness;
      ctx.drawImage(img, 0, 0, width, height);
      const startX = rng() > 0.5 ? 0 : width;
      const grad = ctx.createLinearGradient(startX, 0, width - startX, height);
      grad.addColorStop(0, `rgba(12, 18, 15, ${darkness})`);
      grad.addColorStop(0.55, `rgba(12, 18, 15, ${(darkness * 0.35).toFixed(2)})`);
      grad.addColorStop(1, 'rgba(12, 18, 15, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      break;
    }

    case 'glare': {
      const gx = Math.round(width * (0.2 + rng() * 0.6));
      const gy = Math.round(height * (0.15 + rng() * 0.5));
      const radius = Math.round(Math.min(width, height) * (0.25 + clamped * 0.4));
      params.center_x = +(gx / width).toFixed(2);
      params.center_y = +(gy / height).toFixed(2);
      params.radius_px = radius;
      ctx.drawImage(img, 0, 0, width, height);
      const grad = ctx.createRadialGradient(gx, gy, 4, gx, gy, radius);
      grad.addColorStop(0, `rgba(255, 253, 240, ${(0.55 + clamped * 0.4).toFixed(2)})`);
      grad.addColorStop(0.5, `rgba(255, 250, 224, ${(0.2 + clamped * 0.25).toFixed(2)})`);
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      break;
    }

    case 'blur': {
      const blurPx = +(0.8 + clamped * 5.2).toFixed(1);
      params.radius_px = blurPx;
      ctx.filter = `blur(${blurPx}px)`;
      ctx.drawImage(img, 0, 0, width, height);
      break;
    }

    case 'noise': {
      const sigma = Math.round(12 + clamped * 58);
      params.sigma = sigma;
      ctx.drawImage(img, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      const { data } = imageData;
      for (let i = 0; i < data.length; i += 4) {
        const delta = (rng() - 0.5) * 2 * sigma;
        data[i] = Math.max(0, Math.min(255, data[i] + delta));
        data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + delta));
        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + delta));
      }
      ctx.putImageData(imageData, 0, 0);
      break;
    }

    case 'occlusion_patches': {
      const count = 2 + Math.round(clamped * 4);
      params.patch_count = count;
      ctx.drawImage(img, 0, 0, width, height);
      for (let i = 0; i < count; i += 1) {
        const pw = width * (0.08 + rng() * 0.14 * clamped);
        const ph = height * (0.08 + rng() * 0.14 * clamped);
        const px = rng() * (width - pw);
        const py = rng() * (height - ph);
        ctx.fillStyle = i % 2 === 0 ? 'rgba(42, 46, 43, 0.88)' : 'rgba(92, 84, 72, 0.82)';
        ctx.fillRect(px, py, pw, ph);
      }
      break;
    }

    case 'stain_overlay': {
      const spots = 3 + Math.round(clamped * 5);
      params.stain_spots = spots;
      params.opacity = +(0.25 + clamped * 0.35).toFixed(2);
      ctx.drawImage(img, 0, 0, width, height);
      for (let i = 0; i < spots; i += 1) {
        const sx = rng() * width;
        const sy = rng() * height;
        const rx = 18 + rng() * 54 * clamped;
        const ry = 12 + rng() * 38 * clamped;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(rng() * Math.PI);
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.fillStyle =
          i % 2 === 0
            ? `rgba(98, 66, 36, ${(0.22 + clamped * 0.32).toFixed(2)})`
            : `rgba(54, 48, 38, ${(0.18 + clamped * 0.28).toFixed(2)})`;
        ctx.fill();
        ctx.restore();
      }
      break;
    }

    case 'rotation': {
      const deg = Math.round((rng() > 0.5 ? 1 : -1) * (6 + clamped * 28));
      params.angle_deg = deg;
      ctx.translate(width / 2, height / 2);
      ctx.rotate((deg * Math.PI) / 180);
      ctx.drawImage(img, -width / 2, -height / 2, width, height);
      break;
    }

    case 'perspective': {
      const skewX = +((rng() > 0.5 ? 1 : -1) * (0.08 + clamped * 0.22)).toFixed(2);
      const skewY = +((rng() - 0.5) * 0.16 * clamped).toFixed(2);
      params.skew_x = skewX;
      params.skew_y = skewY;
      ctx.translate(width / 2, height / 2);
      ctx.transform(1, skewY, skewX, 0.92, 0, 0);
      ctx.drawImage(img, -width / 2, -height / 2, width, height);
      break;
    }

    case 'elastic': {
      const amp = +(4 + clamped * 14).toFixed(1);
      params.amplitude_px = amp;
      params.strips = 18;
      const strips = 18;
      const sh = img.height / strips;
      const dh = height / strips;
      for (let i = 0; i < strips; i += 1) {
        const offset = Math.sin((i / strips) * Math.PI * 2.5 + rng() * 0.6) * amp;
        ctx.drawImage(img, 0, i * sh, img.width, sh, offset, i * dh, width, dh + 1);
      }
      break;
    }

    case 'crumple': {
      const folds = 3 + Math.round(clamped * 4);
      params.folds = folds;
      ctx.drawImage(img, 0, 0, width, height);
      for (let i = 0; i < folds; i += 1) {
        const x1 = rng() * width;
        const y1 = rng() * height;
        const x2 = rng() * width;
        const y2 = rng() * height;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = `rgba(18, 28, 22, ${(0.18 + clamped * 0.25).toFixed(2)})`;
        ctx.lineWidth = 2 + clamped * 3;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x1 + 2, y1 + 2);
        ctx.lineTo(x2 + 2, y2 + 2);
        ctx.strokeStyle = `rgba(255, 252, 244, ${(0.22 + clamped * 0.22).toFixed(2)})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      break;
    }

    case 'partial_crop': {
      const cropFactor = +(0.62 + (1 - clamped) * 0.24).toFixed(2);
      const sw = img.width * cropFactor;
      const sh = img.height * cropFactor;
      const sx = rng() * (img.width - sw);
      const sy = rng() * (img.height - sh);
      params.crop_ratio = cropFactor;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
      break;
    }

    default: {
      ctx.filter = `contrast(${(1 + clamped * 0.2).toFixed(2)})`;
      ctx.drawImage(img, 0, 0, width, height);
      params.intensity = clamped;
    }
  }

  ctx.restore();
  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.88),
    params,
  };
}