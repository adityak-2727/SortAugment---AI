import JSZip from 'jszip';
import { loadImageElement } from './mockCanvas';

function escapeCsvCell(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function dataUrlToBase64(dataUrl) {
  const commaIdx = dataUrl.indexOf(',');
  return commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : '';
}

async function resolveImageAsJpegBase64(url) {
  if (typeof url === 'string' && url.startsWith('data:image/jpeg;base64,')) {
    return dataUrlToBase64(url);
  }
  try {
    const img = await loadImageElement(url);
    const canvas = document.createElement('canvas');
    canvas.width = img.width || 480;
    canvas.height = img.height || 360;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#F6F4EE';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return dataUrlToBase64(canvas.toDataURL('image/jpeg', 0.88));
  } catch {
    return '';
  }
}

function stripExtension(filename) {
  const idx = filename.lastIndexOf('.');
  return idx > 0 ? filename.slice(0, idx) : filename;
}

/**
 * Builds a real downloadable ZIP archive in mock mode using JSZip,
 * matching the exact backend export layout:
 *   <label>/<source>_<variant>.jpg
 *   manifest.csv (file, source_name, label, axis, effect, params_json, seed)
 */
export async function buildMockExportZip({
  job,
  includeOriginals = false,
  resolveUrl,
  onProgress,
}) {
  const zip = new JSZip();
  const rows = [['file', 'source_name', 'label', 'axis', 'effect', 'params_json', 'seed']];

  const sources = job?.result?.sources || [];
  const seed = job?.seed ?? '';

  for (const source of sources) {
    const safeLabel = (source.label || 'unlabeled').replace(/[^a-zA-Z0-9_-]/g, '_');
    const baseName = stripExtension(source.name || source.source_id).replace(/[^a-zA-Z0-9_-]/g, '_');

    if (includeOriginals) {
      const origPath = `${safeLabel}/${baseName}_original.jpg`;
      const origB64 = await resolveImageAsJpegBase64(resolveUrl(source.url));
      if (origB64) {
        zip.file(origPath, origB64, { base64: true });
      }
      rows.push([origPath, source.name, source.label || 'unlabeled', 'original', 'none', '{}', seed]);
    }

    for (const variant of source.variants || []) {
      const varPath = `${safeLabel}/${baseName}_${variant.variant_id}.jpg`;
      const varB64 = await resolveImageAsJpegBase64(resolveUrl(variant.url));
      if (varB64) {
        zip.file(varPath, varB64, { base64: true });
      }
      rows.push([
        varPath,
        source.name,
        source.label || 'unlabeled',
        variant.axis || '',
        variant.effect || '',
        JSON.stringify(variant.params || {}),
        seed,
      ]);
    }
  }

  const csvContent = rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n');
  zip.file('manifest.csv', csvContent);

  const blob = await zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    (metadata) => {
      if (onProgress) {
        const pct = Math.min(100, Math.round(metadata.percent || 0));
        onProgress({ loaded: pct, total: 100, percent: pct, indeterminate: false });
      }
    }
  );

  return blob;
}