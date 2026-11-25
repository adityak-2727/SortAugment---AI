import {
  mockGetHealth,
  mockGetEffects,
  mockCreateAugmentJob,
  mockListJobs,
  mockGetJob,
  mockCancelJob,
  mockClassifyJob,
  mockGetGallery,
  mockCreateGenerateJob,
  mockGetResults,
  mockExportJob,
  resolveMockFileUrl,
} from './mockEngine';

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(
  /\/+$/,
  ''
);

// Default to mock mode unless explicitly set to "false"
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'unknown_error' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Prefixes /files/... paths with API_BASE_URL in live mode,
 * or resolves in-memory mock files in demo mode.
 */
export function resolveFileUrl(url) {
  if (!url) return '';
  if (USE_MOCK) {
    return resolveMockFileUrl(url);
  }
  if (/^(https?:|data:|blob:)/i.test(url)) {
    return url;
  }
  const normalized = url.startsWith('/') ? url : `/${url}`;
  return `${API_BASE_URL}${normalized}`;
}

async function parseErrorResponse(response) {
  let code = `http_${response.status}`;
  let message = `Request failed with status ${response.status}`;
  try {
    const body = await response.json();
    if (body?.error) {
      code = body.error.code || code;
      message = body.error.message || message;
    }
  } catch {
    // Response was not JSON; keep fallback status message
  }
  return new ApiError(message, { status: response.status, code });
}

async function requestJson(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, options);
  } catch {
    throw new ApiError(
      `Unable to reach API at ${API_BASE_URL}. Ensure the backend is running or set VITE_USE_MOCK=true.`,
      { status: 0, code: 'network_error' }
    );
  }

  if (!response.ok) {
    throw await parseErrorResponse(response);
  }
  return response.json();
}

/** GET /api/health */
export async function getHealth() {
  if (USE_MOCK) return mockGetHealth();
  return requestJson('/api/health');
}

/** GET /api/effects */
export async function getEffects() {
  if (USE_MOCK) return mockGetEffects();
  return requestJson('/api/effects');
}

/** POST /api/augment (multipart/form-data) */
export async function createAugmentJob({
  files,
  axes,
  effects = null,
  intensity = 0.5,
  variantsPerImage = 3,
  seed = null,
  labels = null,
}) {
  if (USE_MOCK) {
    return mockCreateAugmentJob({
      files,
      axes,
      effects,
      intensity,
      variantsPerImage,
      seed,
      labels: labels || {},
    });
  }

  const formData = new FormData();
  files.forEach((file) => {
    formData.append('files', file, file.name);
  });
  formData.append('axes', JSON.stringify(axes));
  if (Array.isArray(effects) && effects.length > 0) {
    formData.append('effects', JSON.stringify(effects));
  }
  formData.append('intensity', String(intensity));
  formData.append('variants_per_image', String(variantsPerImage));
  if (seed !== null && seed !== '' && seed !== undefined) {
    formData.append('seed', String(Number(seed)));
  }
  if (labels && Object.keys(labels).length > 0) {
    formData.append('labels', JSON.stringify(labels));
  }

  return requestJson('/api/augment', {
    method: 'POST',
    body: formData,
  });
}

/** GET /api/jobs */
export async function listJobs() {
  if (USE_MOCK) return mockListJobs();
  return requestJson('/api/jobs');
}

/** GET /api/jobs/{job_id} */
export async function getJob(jobId) {
  if (USE_MOCK) return mockGetJob(jobId);
  return requestJson(`/api/jobs/${encodeURIComponent(jobId)}`);
}

/** POST /api/jobs/{job_id}/cancel */
export async function cancelJob(jobId) {
  if (USE_MOCK) return mockCancelJob(jobId);
  return requestJson(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST',
  });
}

/** POST /api/classify */
export async function classifyJob(jobId) {
  if (USE_MOCK) return mockClassifyJob(jobId);
  return requestJson('/api/classify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: jobId }),
  });
}

/** GET /api/gallery?cls=&axis=&page=1&page_size=24 */
export async function getGallery({ cls = '', axis = '', page = 1, pageSize = 24 } = {}) {
  if (USE_MOCK) return mockGetGallery({ cls, axis, page, pageSize });
  const params = new URLSearchParams({
    cls,
    axis,
    page: String(page),
    page_size: String(pageSize),
  });
  return requestJson(`/api/gallery?${params.toString()}`);
}

/** POST /api/generate (multipart/form-data) */
export async function createGenerateJob({ files, axis, strength = 0.45, variantsPerImage = 2 }) {
  if (USE_MOCK) {
    return mockCreateGenerateJob({ files, axis, strength, variantsPerImage });
  }

  const formData = new FormData();
  files.forEach((file) => {
    formData.append('files', file, file.name);
  });
  formData.append('axis', axis);
  formData.append('strength', String(strength));
  formData.append('variants_per_image', String(variantsPerImage));

  return requestJson('/api/generate', {
    method: 'POST',
    body: formData,
  });
}

/** GET /api/results */
export async function getResults() {
  if (USE_MOCK) return mockGetResults();
  return requestJson('/api/results');
}

/**
 * GET /api/jobs/{job_id}/export?include_originals=true|false -> application/zip
 * Reports determinate progress when Content-Length is present, and indeterminate
 * progress ({ total: null, percent: null, indeterminate: true }) when absent.
 */
export async function exportJob(jobId, { includeOriginals = false, onProgress } = {}) {
  if (USE_MOCK) {
    return mockExportJob(jobId, { includeOriginals, onProgress });
  }

  const query = `?include_originals=${includeOriginals ? 'true' : 'false'}`;
  let response;
  try {
    response = await fetch(
      `${API_BASE_URL}/api/jobs/${encodeURIComponent(jobId)}/export${query}`
    );
  } catch {
    throw new ApiError(`Unable to download export from ${API_BASE_URL}.`, {
      status: 0,
      code: 'network_error',
    });
  }

  if (!response.ok) {
    throw await parseErrorResponse(response);
  }

  const contentLengthHeader = response.headers.get('content-length');
  const parsedTotal = contentLengthHeader ? Number(contentLengthHeader) : NaN;
  const hasKnownTotal = Number.isFinite(parsedTotal) && parsedTotal > 0;

  let blob;
  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const chunks = [];
    let loaded = 0;

    if (onProgress) {
      onProgress({
        loaded: 0,
        total: hasKnownTotal ? parsedTotal : null,
        percent: hasKnownTotal ? 0 : null,
        indeterminate: !hasKnownTotal,
      });
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      if (onProgress) {
        onProgress({
          loaded,
          total: hasKnownTotal ? parsedTotal : null,
          percent: hasKnownTotal ? Math.min(100, Math.round((loaded / parsedTotal) * 100)) : null,
          indeterminate: !hasKnownTotal,
        });
      }
    }
    blob = new Blob(chunks, { type: 'application/zip' });
  } else {
    if (onProgress) {
      onProgress({ loaded: 0, total: null, percent: null, indeterminate: true });
    }
    blob = await response.blob();
    if (onProgress) {
      onProgress({ loaded: blob.size, total: blob.size, percent: 100, indeterminate: false });
    }
  }

  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/i);
  const filename =
    match?.[1] || `sortaugment_${jobId}${includeOriginals ? '_with_originals' : ''}.zip`;

  return { blob, filename };
}