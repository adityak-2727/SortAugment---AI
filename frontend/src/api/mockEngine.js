import { MOCK_HEALTH, MOCK_EFFECTS, createMockRegistryAndFixtures } from './mockData';
import { createSeededRng, fileToDataUrl, simulateAugmentationOnCanvas } from './mockCanvas';
import { buildMockExportZip } from './mockZip';

const fixtures = createMockRegistryAndFixtures();
const jobs = new Map([[fixtures.seededJob.job_id, fixtures.seededJob]]);
let jobCounter = 2;

const mockHealthState = structuredClone(MOCK_HEALTH);

export function resolveMockFileUrl(url) {
  if (!url) return '';
  if (fixtures.fileMap.has(url)) {
    return fixtures.fileMap.get(url);
  }
  return url;
}

export function setMockGpuAvailable(available, reason = null) {
  mockHealthState.gpu.available = available;
  mockHealthState.live_generation.available = available;
  mockHealthState.live_generation.reason = available
    ? null
    : reason || 'No CUDA-capable GPU detected on host (demo simulation).';
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createApiError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function findAxisForEffect(effectId) {
  for (const axis of MOCK_EFFECTS.axes) {
    if (axis.effects.some((ef) => ef.id === effectId)) {
      return axis.id;
    }
  }
  return 'lighting';
}

export async function mockGetHealth() {
  await delay(140);
  return structuredClone(mockHealthState);
}

export async function mockGetEffects() {
  await delay(120);
  return structuredClone(MOCK_EFFECTS);
}

export async function mockListJobs() {
  await delay(120);
  const list = Array.from(jobs.values())
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map((job) => {
      const sources = job.result?.sources || job._plannedSources || [];
      const nVariants = sources.reduce((acc, s) => acc + (s.variants?.length || 0), 0);
      return {
        job_id: job.job_id,
        type: job.type,
        status: job.status,
        created_at: job.created_at,
        n_sources: sources.length,
        n_variants: job.status === 'done' ? nVariants : job.progress.total,
      };
    });
  return { jobs: list };
}

export async function mockGetJob(jobId) {
  await delay(90);
  const job = jobs.get(jobId);
  if (!job) {
    throw createApiError(404, 'job_not_found', `Job ${jobId} was not found.`);
  }
  return {
    job_id: job.job_id,
    type: job.type,
    status: job.status,
    progress: { ...job.progress },
    eta_seconds: job.eta_seconds,
    error: job.error,
    result: job.status === 'done' ? structuredClone(job.result) : null,
  };
}

export async function mockCancelJob(jobId) {
  await delay(100);
  const job = jobs.get(jobId);
  if (!job) {
    throw createApiError(404, 'job_not_found', `Job ${jobId} was not found.`);
  }
  job._cancelled = true;
  if (job.status === 'queued' || job.status === 'running') {
    job.status = 'cancelled';
    job.eta_seconds = null;
  }
  return { status: 'cancelled' };
}

export async function mockCreateAugmentJob({
  files,
  axes,
  effects,
  intensity = 0.5,
  variantsPerImage = 3,
  seed = null,
  labels = {},
}) {
  if (!files || files.length === 0) {
    throw createApiError(400, 'no_files', 'Upload at least one image to run augmentation.');
  }
  if (!axes || axes.length === 0) {
    throw createApiError(400, 'no_axes', 'Select at least one augmentation axis.');
  }

  const jobId = `job_aug_${String(jobCounter).padStart(3, '0')}`;
  jobCounter += 1;

  // Build effect pool from chosen effects, or all effects belonging to chosen axes
  let effectPool = Array.isArray(effects) && effects.length > 0 ? [...effects] : [];
  if (effectPool.length === 0) {
    for (const axisId of axes) {
      const found = MOCK_EFFECTS.axes.find((a) => a.id === axisId);
      if (found) {
        effectPool.push(...found.effects.map((e) => e.id));
      }
    }
  }

  const totalVariants = files.length * variantsPerImage;
  const resolvedSeed = seed !== null && seed !== '' && seed !== undefined ? Number(seed) : Math.floor(Math.random() * 100000);
  const rng = createSeededRng(resolvedSeed);

  const jobRecord = {
    job_id: jobId,
    type: 'augment',
    status: 'queued',
    created_at: new Date().toISOString(),
    seed: resolvedSeed,
    progress: { done: 0, total: totalVariants },
    eta_seconds: Math.max(1, Math.round(totalVariants * 0.35)),
    error: null,
    result: null,
    _plannedSources: files.map((f, i) => ({ source_id: `src_${i + 1}`, name: f.name })),
    _cancelled: false,
  };
  jobs.set(jobId, jobRecord);

  // Process asynchronously to mirror real queued -> running -> done job lifecycle
  (async () => {
    await delay(220);
    if (jobRecord._cancelled) return;
    jobRecord.status = 'running';

    try {
      const builtSources = [];

      for (let sIdx = 0; sIdx < files.length; sIdx += 1) {
        if (jobRecord._cancelled) return;
        const file = files[sIdx];
        const sourceId = `src_${sIdx + 1}`;
        const originalDataUrl = await fileToDataUrl(file);
        const origPath = fixtures.registerMockFile(
          `/files/mock/jobs/${jobId}/${sourceId}_orig.jpg`,
          originalDataUrl
        );

        const variants = [];
        for (let vIdx = 0; vIdx < variantsPerImage; vIdx += 1) {
          if (jobRecord._cancelled) return;
          const effectId = effectPool[(sIdx * variantsPerImage + vIdx) % effectPool.length];
          const axisId = findAxisForEffect(effectId);

          const { dataUrl, params } = await simulateAugmentationOnCanvas({
            sourceDataUrl: originalDataUrl,
            effect: effectId,
            intensity,
            rng,
          });

          const variantId = `${sourceId}_v${vIdx + 1}`;
          const varPath = fixtures.registerMockFile(
            `/files/mock/jobs/${jobId}/${variantId}.jpg`,
            dataUrl
          );

          variants.push({
            variant_id: variantId,
            url: varPath,
            axis: axisId,
            effect: effectId,
            params,
          });

          jobRecord.progress.done += 1;
          const remaining = jobRecord.progress.total - jobRecord.progress.done;
          jobRecord.eta_seconds = remaining > 0 ? Math.max(1, Math.ceil(remaining * 0.28)) : 0;
          await delay(160);
        }

        builtSources.push({
          source_id: sourceId,
          name: file.name,
          label: labels[file.name] || 'unlabeled',
          url: origPath,
          variants,
        });
      }

      if (jobRecord._cancelled) return;
      jobRecord.result = { sources: builtSources };
      jobRecord.status = 'done';
      jobRecord.eta_seconds = 0;
    } catch (err) {
      jobRecord.status = 'failed';
      jobRecord.error = err.message || 'Canvas augmentation failed in demo mode.';
      jobRecord.eta_seconds = null;
    }
  })();

  return { job_id: jobId };
}

export async function mockCreateGenerateJob({
  files,
  axis,
  strength = 0.45,
  variantsPerImage = 2,
}) {
  await delay(180);
  if (!mockHealthState.live_generation.available) {
    throw createApiError(
      503,
      'gpu_unavailable',
      mockHealthState.live_generation.reason || 'GPU unavailable for live generation.'
    );
  }
  if (!files || files.length === 0) {
    throw createApiError(400, 'no_files', 'Upload at least one image for live generation.');
  }

  const jobId = `job_gen_${String(jobCounter).padStart(3, '0')}`;
  jobCounter += 1;

  const axisDef = MOCK_EFFECTS.axes.find((a) => a.id === axis) || MOCK_EFFECTS.axes[0];
  const effectPool = axisDef.effects.map((e) => e.id);
  const totalVariants = files.length * variantsPerImage;
  const rng = createSeededRng(Date.now() % 100000);

  const jobRecord = {
    job_id: jobId,
    type: 'generate',
    status: 'queued',
    created_at: new Date().toISOString(),
    seed: Math.floor(rng() * 10000),
    progress: { done: 0, total: totalVariants },
    eta_seconds: Math.max(2, totalVariants * 2),
    error: null,
    result: null,
    _plannedSources: files.map((f, i) => ({ source_id: `src_${i + 1}`, name: f.name })),
    _cancelled: false,
  };
  jobs.set(jobId, jobRecord);

  (async () => {
    await delay(300);
    if (jobRecord._cancelled) return;
    jobRecord.status = 'running';

    try {
      const builtSources = [];
      for (let sIdx = 0; sIdx < files.length; sIdx += 1) {
        if (jobRecord._cancelled) return;
        const file = files[sIdx];
        const sourceId = `src_${sIdx + 1}`;
        const originalDataUrl = await fileToDataUrl(file);
        const origPath = fixtures.registerMockFile(
          `/files/mock/jobs/${jobId}/${sourceId}_orig.jpg`,
          originalDataUrl
        );

        const variants = [];
        for (let vIdx = 0; vIdx < variantsPerImage; vIdx += 1) {
          if (jobRecord._cancelled) return;
          const effectId = effectPool[(sIdx + vIdx) % effectPool.length];
          const mode = vIdx % 2 === 0 ? 'img2img' : 'inpaint';
          const { dataUrl, params } = await simulateAugmentationOnCanvas({
            sourceDataUrl: originalDataUrl,
            effect: effectId,
            intensity: Math.min(1, strength * 1.25),
            rng,
          });

          const variantId = `${sourceId}_g${vIdx + 1}`;
          const varPath = fixtures.registerMockFile(
            `/files/mock/jobs/${jobId}/${variantId}.jpg`,
            dataUrl
          );

          variants.push({
            variant_id: variantId,
            url: varPath,
            axis: axisDef.id,
            effect: effectId,
            mode,
            params: { ...params, strength },
          });

          jobRecord.progress.done += 1;
          const remaining = jobRecord.progress.total - jobRecord.progress.done;
          jobRecord.eta_seconds = remaining > 0 ? Math.max(1, remaining * 1.5) : 0;
          await delay(550);
        }

        builtSources.push({
          source_id: sourceId,
          name: file.name,
          label: 'unlabeled',
          url: origPath,
          variants,
        });
      }

      if (jobRecord._cancelled) return;
      jobRecord.result = { sources: builtSources };
      jobRecord.status = 'done';
      jobRecord.eta_seconds = 0;
    } catch (err) {
      jobRecord.status = 'failed';
      jobRecord.error = err.message || 'Live generation simulation failed.';
      jobRecord.eta_seconds = null;
    }
  })();

  return { job_id: jobId };
}

export async function mockClassifyJob(jobId) {
  await delay(420);
  const job = jobs.get(jobId);
  if (!job || !job.result) {
    throw createApiError(404, 'job_not_ready', `Completed job ${jobId} was not found.`);
  }

  const classes = mockHealthState.classes;
  const rng = createSeededRng(job.seed || 77);
  let totalVariants = 0;
  let predictionChanged = 0;

  const items = job.result.sources.map((src, sIdx) => {
    const baseLabel = classes.includes(src.label) ? src.label : classes[sIdx % classes.length];
    const baseConf = +(0.78 + rng() * 0.18).toFixed(3);

    // Build normalized probability distribution across classes
    const rawWeights = classes.map((c) => (c === baseLabel ? 0 : 0.05 + rng()));
    const weightSum = rawWeights.reduce((a, b) => a + b, 0) || 1;
    const remainder = Math.max(0.001, 1 - baseConf);
    const probs = {};
    classes.forEach((c, i) => {
      probs[c] = c === baseLabel ? baseConf : +((rawWeights[i] / weightSum) * remainder).toFixed(3);
    });

    const variants = src.variants.map((v, vIdx) => {
      totalVariants += 1;
      // Contamination & condition flip slightly more often in demo simulation
      const flipChance = v.axis === 'contamination' ? 0.38 : v.axis === 'condition' ? 0.28 : 0.2;
      const changed = rng() < flipChance || (sIdx === 0 && vIdx === 1);
      if (changed) predictionChanged += 1;

      const altClass = classes[(classes.indexOf(baseLabel) + 1 + vIdx) % classes.length];
      const vConf = changed
        ? +(0.46 + rng() * 0.28).toFixed(3)
        : +(Math.max(0.51, baseConf - rng() * 0.22)).toFixed(3);

      return {
        variant_id: v.variant_id,
        label: changed ? altClass : baseLabel,
        confidence: vConf,
        changed,
      };
    });

    return {
      source_id: src.source_id,
      original: {
        label: baseLabel,
        confidence: baseConf,
        probs,
      },
      variants,
    };
  });

  return {
    job_id: jobId,
    model: 'resnet50-trashnet-demo-v1',
    summary: {
      total_variants: totalVariants,
      prediction_changed: predictionChanged,
    },
    items,
  };
}

export async function mockGetGallery({ cls = '', axis = '', page = 1, pageSize = 24 } = {}) {
  await delay(180);
  const filtered = fixtures.galleryItems.filter((item) => {
    if (cls && item.class !== cls) return false;
    if (axis && item.axis !== axis) return false;
    return true;
  });

  const safePage = Math.max(1, Number(page) || 1);
  const safeSize = Math.max(1, Number(pageSize) || 24);
  const start = (safePage - 1) * safeSize;
  const items = filtered.slice(start, start + safeSize);

  return {
    total: filtered.length,
    page: safePage,
    page_size: safeSize,
    items: structuredClone(items),
  };
}

export async function mockGetResults() {
  await delay(200);
  return structuredClone(fixtures.results);
}

export async function mockExportJob(jobId, { includeOriginals = false, onProgress } = {}) {
  const job = jobs.get(jobId);
  if (!job || !job.result) {
    throw createApiError(404, 'job_not_ready', `Completed job ${jobId} is not available for export.`);
  }
  const blob = await buildMockExportZip({
    job,
    includeOriginals,
    resolveUrl: resolveMockFileUrl,
    onProgress,
  });
  return {
    blob,
    filename: `sortaugment_${jobId}${includeOriginals ? '_with_originals' : ''}.zip`,
  };
}