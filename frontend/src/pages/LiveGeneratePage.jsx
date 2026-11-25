import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Cpu,
  Download,
  Droplets,
  History,
  ImagePlus,
  Images,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  UploadCloud,
  Wrench,
  XCircle,
} from 'lucide-react';
import { createGenerateJob, getJob, resolveFileUrl } from '../api/client';
import { setMockGpuAvailable } from '../api/mockEngine';
import { createMockMaterialSvg } from '../api/mockSvg';
import { useAppData } from '../context/AppDataContext';
import { useJobs } from '../context/JobsContext';
import { useToast } from '../context/ToastContext';
import { extractDroppedImages, extractInputImages } from '../utils/folderDrop';
import { formatBytes, formatEffectName, formatEta, formatTimestamp } from '../utils/formatters';
import { PageTransition } from '../components/ui/PageTransition';
import { AxisChip } from '../components/ui/ClassChip';
import { BeforeAfterSlider } from '../components/ui/BeforeAfterSlider';
import { ProgressRing } from '../components/ui/ProgressRing';
import { TiltCard } from '../components/ui/TiltCard';
import { Lightbox } from '../components/ui/Lightbox';
import { SkeletonBox } from '../components/ui/Skeleton';
import { StatePanel } from '../components/ui/StatePanel';

const AXIS_CARDS = [
  {
    id: 'lighting',
    label: 'Lighting',
    hint: 'Synthesizes realistic facility shadows, glare, and dim overhead tones.',
    icon: Sun,
  },
  {
    id: 'contamination',
    label: 'Contamination',
    hint: 'Adds surface stains, moisture sheen, and conveyor debris.',
    icon: Droplets,
  },
  {
    id: 'condition',
    label: 'Material condition',
    hint: 'Simulates dents, folding, tearing, and belt compression.',
    icon: Wrench,
  },
];

async function sampleSvgToFile(cls) {
  const svg = createMockMaterialSvg({ cls, variantTag: 'ORIGINAL', seed: 91 });
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 480;
      canvas.height = 360;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, 480, 360);
      canvas.toBlob(
        (blob) => {
          if (!blob) reject(new Error('Failed to create sample file.'));
          else resolve(new File([blob], `live_${cls}_capture.jpg`, { type: 'image/jpeg' }));
        },
        'image/jpeg',
        0.9
      );
    };
    img.onerror = reject;
    img.src = svg;
  });
}

export function LiveGeneratePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { gpu, liveGeneration, classes, isMock, loading: metaLoading, refresh } = useAppData();
  const {
    recentJobs,
    activeJobId,
    activeJob,
    polling,
    cancelling,
    activeError,
    trackJob,
    cancelActiveJob,
    dismissCompletedNotice,
  } = useJobs();
  const { addToast } = useToast();

  const [files, setFiles] = useState([]); // [{ id, file, previewUrl }]
  const [isDragging, setIsDragging] = useState(false);
  const [axis, setAxis] = useState('contamination');
  const [strength, setStrength] = useState(0.45);
  const [variantsPerImage, setVariantsPerImage] = useState(2);
  const [submitting, setSubmitting] = useState(false);

  // Supports tracking background generation & reopening past GPU jobs
  const [viewingJobId, setViewingJobId] = useState(() => searchParams.get('job') || '');
  const [loadedJob, setLoadedJob] = useState(null);
  const [loadingJob, setLoadingJob] = useState(false);
  const [loadJobError, setLoadJobError] = useState(null);
  const [lightboxIdx, setLightboxIdx] = useState(null);

  const fileInputRef = useRef(null);
  const dragDepthRef = useRef(0);
  const previewUrlsRef = useRef([]);

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  // Load job from ?job= query parameter
  useEffect(() => {
    const paramJob = searchParams.get('job');
    if (!paramJob) {
      setViewingJobId('');
      setLoadedJob(null);
      setLoadJobError(null);
      return;
    }

    setViewingJobId(paramJob);
    dismissCompletedNotice();

    if (paramJob === activeJobId && activeJob) {
      setLoadedJob(activeJob);
      setLoadJobError(null);
      return;
    }

    let cancelled = false;
    setLoadingJob(true);
    setLoadJobError(null);
    getJob(paramJob)
      .then((res) => {
        if (cancelled) return;
        setLoadedJob(res);
        if (res.status === 'queued' || res.status === 'running') {
          trackJob(res.job_id, res.type || 'generate');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadJobError(err?.message || `Could not load job ${paramJob}.`);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingJob(false);
      });

    return () => {
      cancelled = true;
    };
  }, [searchParams, activeJobId, activeJob, dismissCompletedNotice, trackJob]);

  const currentJob =
    viewingJobId && viewingJobId === activeJobId ? activeJob || loadedJob : loadedJob;
  const isRunning =
    Boolean(viewingJobId && viewingJobId === activeJobId && polling) ||
    currentJob?.status === 'queued' ||
    currentJob?.status === 'running';

  const canGenerate = Boolean(liveGeneration?.available);
  const unavailableReason =
    liveGeneration?.reason || 'No compatible GPU was detected for on-demand diffusion inference.';

  const appendFiles = useCallback(
    (extracted) => {
      if (!extracted.length) {
        addToast({ title: 'Please select image files (JPG, PNG, WebP).', tone: 'warning' });
        return;
      }
      setFiles((prev) => {
        const next = extracted.slice(0, Math.max(0, 10 - prev.length)).map((item, idx) => {
          const previewUrl = URL.createObjectURL(item.file);
          previewUrlsRef.current.push(previewUrl);
          return {
            id: `${Date.now()}_${idx}_${item.file.name}`,
            file: item.file,
            previewUrl,
          };
        });
        return [...prev, ...next];
      });
    },
    [addToast]
  );

  const handleDrop = async (e) => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDragging(false);
    const existing = new Set(files.map((f) => f.file.name));
    const extracted = await extractDroppedImages(e.dataTransfer, classes, existing);
    appendFiles(extracted);
  };

  const handleInputChange = (e) => {
    const existing = new Set(files.map((f) => f.file.name));
    const extracted = extractInputImages(e.target.files, classes, existing);
    appendFiles(extracted);
    e.target.value = '';
  };

  const handleLoadSample = async () => {
    try {
      const sampleCls = classes[0] || 'plastic';
      const file = await sampleSvgToFile(sampleCls);
      appendFiles([{ file }]);
    } catch {
      addToast({ title: 'Failed to load sample image', tone: 'error' });
    }
  };

  const handleToggleMockGpu = async () => {
    setMockGpuAvailable(!canGenerate);
    await refresh();
  };

  const handleStartGenerate = async () => {
    if (!files.length) {
      addToast({ title: 'Upload at least one image first.', tone: 'warning' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await createGenerateJob({
        files: files.map((f) => f.file),
        axis,
        strength,
        variantsPerImage,
      });
      setViewingJobId(res.job_id);
      setLoadedJob(null);
      setLightboxIdx(null);
      setSearchParams({ job: res.job_id }, { replace: true });
      trackJob(res.job_id, 'generate');
    } catch (err) {
      if (err?.code === 'gpu_unavailable' || err?.status === 503) {
        await refresh();
      }
      addToast({
        title: 'Live generation unavailable',
        description: err?.message || 'Unable to start generation job.',
        tone: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const removeFile = (id) => {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  };

  const handleResetView = () => {
    setViewingJobId('');
    setLoadedJob(null);
    setLoadJobError(null);
    setLightboxIdx(null);
    setSearchParams({}, { replace: true });
  };

  const recentGenJobs = useMemo(
    () => recentJobs.filter((j) => j.type === 'generate' && j.status === 'done'),
    [recentJobs]
  );

  const flattenedVariants = useMemo(() => {
    const out = [];
    (currentJob?.result?.sources || []).forEach((src) => {
      (src.variants || []).forEach((variant) => {
        out.push({
          src,
          variant,
          beforeSrc: resolveFileUrl(src.url),
          afterSrc: resolveFileUrl(variant.url),
        });
      });
    });
    return out;
  }, [currentJob]);

  const activeLightboxItem =
    lightboxIdx !== null && flattenedVariants[lightboxIdx] ? flattenedVariants[lightboxIdx] : null;

  return (
    <PageTransition className="space-y-6">
      {/* GPU Status Header Bar */}
      <section className="sa-card flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="font-display text-xl font-semibold text-ink">
              On-Demand Generative Synthesis
            </h2>

            {/* GPU Status Pill from /api/health */}
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs font-medium ${
                metaLoading
                  ? 'border-ink/15 bg-paper text-ink-subtle'
                  : canGenerate
                    ? 'border-emeraldok-border bg-emeraldok-bg text-emeraldok-text'
                    : 'border-amberwarn-border bg-amberwarn-bg text-amberwarn-text'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  metaLoading
                    ? 'bg-ink-subtle'
                    : canGenerate
                      ? 'bg-emeraldok-accent'
                      : 'bg-amberwarn-accent'
                }`}
                aria-hidden="true"
              />
              <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
              {metaLoading
                ? 'Checking GPU…'
                : canGenerate
                  ? `${gpu?.name || 'GPU Ready'}${gpu?.vram_gb ? ` · ${gpu.vram_gb} GB VRAM` : ''}`
                  : 'GPU Unavailable'}
            </span>
          </div>

          <p className="text-sm text-ink-muted">
            Synthesize img2img and inpaint recyclable variations directly from your uploaded belt
            captures.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {recentGenJobs.length > 0 && (
            <div className="flex items-center gap-1.5">
              <History className="h-3.5 w-3.5 text-ink-subtle" aria-hidden="true" />
              <label htmlFor="recent-gen-reopen" className="sr-only">
                Reopen past generation job
              </label>
              <select
                id="recent-gen-reopen"
                value={viewingJobId}
                onChange={(e) => {
                  const id = e.target.value;
                  if (id) setSearchParams({ job: id });
                  else handleResetView();
                }}
                className="rounded-full border border-ink/15 bg-paper px-3 py-1 font-mono text-[11px] text-ink focus:border-alpine-600 focus:outline-none"
              >
                <option value="">Recent GPU jobs…</option>
                {recentGenJobs.map((j) => (
                  <option key={j.job_id} value={j.job_id}>
                    {j.job_id} · {j.n_variants} var · {formatTimestamp(j.created_at)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Demo-only helper to verify GPU unavailable UI state */}
          {isMock && (
            <button
              type="button"
              onClick={handleToggleMockGpu}
              className="sa-btn-ghost border border-ink/10 text-xs"
              title="Demo mode helper to preview how the page behaves when the backend reports live_generation.available = false"
            >
              Simulate {canGenerate ? 'GPU offline' : 'GPU online'}
            </button>
          )}
        </div>
      </section>

      {/* Friendly Disabled State when live_generation.available === false */}
      {!metaLoading && !canGenerate && !viewingJobId ? (
        <StatePanel
          variant="empty"
          icon={Cpu}
          title="Live generation is disabled on this host"
          description={unavailableReason}
          secondaryAction={
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <Link to="/gallery" className="sa-btn-primary">
                <Images className="h-4 w-4" aria-hidden="true" />
                Browse pre-generated gallery
              </Link>
              <Link to="/augment" className="sa-btn-secondary">
                Use CPU Augment Studio
              </Link>
            </div>
          }
        />
      ) : loadingJob ? (
        <SkeletonBox className="h-64 w-full" />
      ) : loadJobError ? (
        <StatePanel
          variant="error"
          title="Could not load generation job"
          description={loadJobError}
          actionLabel="Start new generation"
          onAction={handleResetView}
        />
      ) : (
        <>
          {/* Running Progress View */}
          {isRunning ? (
            <section className="sa-card flex flex-col items-center justify-center px-6 py-12 text-center">
              <ProgressRing
                value={currentJob?.progress?.done || 0}
                total={currentJob?.progress?.total || Math.max(1, files.length * variantsPerImage)}
                sublabel={`${currentJob?.progress?.done || 0}/${
                  currentJob?.progress?.total || files.length * variantsPerImage
                }`}
              />
              <h3 className="mt-5 font-display text-xl font-semibold text-ink">
                {currentJob?.status === 'queued'
                  ? 'Waiting for GPU worker…'
                  : 'Synthesizing generative variants…'}
              </h3>
              <p className="mt-1.5 font-mono text-xs text-ink-muted">
                Job {viewingJobId} · {formatEta(currentJob?.eta_seconds)}
              </p>
              <p className="mt-1 text-xs text-ink-subtle">
                Progress stays tracked in the top bar if you browse other pages.
              </p>
              <button
                type="button"
                disabled={cancelling}
                onClick={cancelActiveJob}
                className="sa-btn-secondary mt-6 border-err-border text-err-text hover:bg-err-bg"
              >
                <XCircle className="h-4 w-4" aria-hidden="true" />
                {cancelling ? 'Cancelling…' : 'Cancel generation'}
              </button>
            </section>
          ) : currentJob?.status === 'failed' || currentJob?.status === 'cancelled' ? (
            <StatePanel
              variant={currentJob.status === 'failed' ? 'error' : 'empty'}
              title={
                currentJob.status === 'failed' ? 'Live generation failed' : 'Generation cancelled'
              }
              description={
                activeError || currentJob.error || 'The generation job stopped before finishing.'
              }
              actionLabel="Start new generation"
              onAction={handleResetView}
            />
          ) : currentJob?.status === 'done' ? (
            /* Completed Live Generation Results */
            <section className="space-y-5">
              <div className="sa-card flex flex-wrap items-center justify-between gap-4 p-5">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-lg font-semibold text-ink">
                      Generated Variants
                    </h3>
                    <span className="rounded-full border border-alpine-200 bg-alpine-50 px-2.5 py-0.5 font-mono text-xs font-medium text-alpine-800">
                      {currentJob.job_id}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    Inspect before/after fidelity and mode tags before checking classifier impact.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button type="button" onClick={handleResetView} className="sa-btn-ghost text-xs">
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Generate more
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      navigate(`/classify?job=${encodeURIComponent(currentJob.job_id)}`)
                    }
                    className="sa-btn-secondary border-alpine-200 bg-alpine-50 text-alpine-800 hover:bg-alpine-100"
                  >
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    Check classifier
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/export?job=${encodeURIComponent(currentJob.job_id)}`)}
                    className="sa-btn-primary"
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Export ZIP
                  </button>
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {flattenedVariants.map(({ src, variant, beforeSrc, afterSrc }, idx) => (
                  <article
                    key={variant.variant_id}
                    className="sa-card flex flex-col overflow-hidden transition-[border-color,box-shadow] hover:border-alpine-300/80 hover:shadow-elevated"
                  >
                    <div className="p-3 pb-0">
                      <BeforeAfterSlider
                        beforeSrc={beforeSrc}
                        afterSrc={afterSrc}
                        beforeLabel="Original"
                        afterLabel={variant.mode || 'Generated'}
                        alt={`${src.name} ${variant.variant_id}`}
                      />
                    </div>
                    <div className="space-y-2.5 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="truncate font-display text-sm font-semibold text-ink">
                            {formatEffectName(variant.effect) || variant.variant_id}
                          </h4>
                          <p className="truncate font-mono text-[11px] text-ink-subtle">
                            {src.name}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setLightboxIdx(idx)}
                          className="rounded-lg border border-ink/10 p-1.5 text-ink-muted hover:bg-recessed hover:text-ink"
                          aria-label={`Open ${variant.variant_id} in lightbox`}
                        >
                          <Maximize2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <AxisChip axis={variant.axis} size="xs" />
                        {variant.mode && (
                          <span className="rounded-full border border-alpine-200 bg-alpine-50 px-2.5 py-0.5 font-mono text-[11px] font-medium text-alpine-800">
                            {variant.mode}
                          </span>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : (
            /* Configuration & Upload Form */
            <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
              {/* Left: Upload Dropzone */}
              <section className="space-y-4">
                <motion.div
                  animate={
                    isDragging
                      ? { scale: 1.01, borderColor: 'rgba(2, 116, 179, 0.85)' }
                      : { scale: 1, borderColor: 'rgba(15, 30, 46, 0.16)' }
                  }
                  onDragEnter={(e) => {
                    e.preventDefault();
                    dragDepthRef.current += 1;
                    setIsDragging(true);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
                    if (dragDepthRef.current === 0) setIsDragging(false);
                  }}
                  onDrop={handleDrop}
                  className={`flex flex-col items-center justify-center rounded-panel border-2 border-dashed px-6 py-10 text-center backdrop-blur-md transition-colors ${
                    isDragging ? 'bg-alpine-50/85' : 'bg-surface/85'
                  }`}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-card border border-alpine-200 bg-alpine-50 text-alpine-700">
                    <UploadCloud className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <h3 className="mt-3.5 font-display text-lg font-semibold text-ink">
                    Drop source images for synthesis
                  </h3>
                  <p className="mt-1 max-w-sm text-xs leading-relaxed text-ink-muted">
                    Upload 1 to 10 conveyor images. Generation runs sequentially on the worker GPU.
                  </p>
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="sa-btn-primary"
                    >
                      <ImagePlus className="h-4 w-4" aria-hidden="true" />
                      Choose images
                    </button>
                    {isMock && (
                      <button
                        type="button"
                        onClick={handleLoadSample}
                        className="sa-btn-ghost text-alpine-700 hover:bg-alpine-50"
                      >
                        <Sparkles className="h-4 w-4" aria-hidden="true" />
                        Add sample image
                      </button>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleInputChange}
                    className="hidden"
                    aria-label="Select source images for live generation"
                  />
                </motion.div>

                {files.length > 0 && (
                  <div className="sa-card p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="font-display text-sm font-semibold text-ink">
                        Selected Images ({files.length}/10)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
                          setFiles([]);
                        }}
                        className="text-xs font-medium text-err-text hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {files.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 rounded-control border border-ink/10 bg-paper/80 p-2"
                        >
                          <img
                            src={item.previewUrl}
                            alt={item.file.name}
                            className="h-12 w-12 shrink-0 rounded-lg object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-ink">
                              {item.file.name}
                            </p>
                            <p className="font-mono text-[11px] text-ink-subtle">
                              {formatBytes(item.file.size)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFile(item.id)}
                            className="rounded p-1 text-ink-subtle hover:bg-recessed hover:text-err-text"
                            aria-label={`Remove ${item.file.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {/* Right: Generation Controls */}
              <section className="sa-card flex flex-col justify-between space-y-5 p-5">
                <div className="space-y-5">
                  <div className="space-y-2.5">
                    <span className="block text-sm font-semibold text-ink">
                      Target Variation Axis
                    </span>
                    <div className="space-y-2.5">
                      {AXIS_CARDS.map((card) => {
                        const Icon = card.icon;
                        const active = axis === card.id;
                        return (
                          <TiltCard
                            key={card.id}
                            maxTilt={4}
                            scaleOnHover={1.01}
                            className={`p-0 ${
                              active
                                ? 'border-alpine-500 bg-alpine-50/75 ring-1 ring-alpine-500/20'
                                : ''
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setAxis(card.id)}
                              aria-pressed={active}
                              className="flex w-full items-start gap-3 p-3.5 text-left"
                            >
                              <div
                                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                                  active
                                    ? 'bg-alpine-600 text-surface shadow-sm'
                                    : 'border border-ink/10 bg-paper text-ink-muted'
                                }`}
                              >
                                <Icon className="h-4 w-4" aria-hidden="true" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-ink">{card.label}</p>
                                <p className="text-xs text-ink-muted">{card.hint}</p>
                              </div>
                            </button>
                          </TiltCard>
                        );
                      })}
                    </div>
                  </div>

                  {/* Strength slider (0.3 .. 0.7) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label htmlFor="gen-strength" className="text-sm font-semibold text-ink">
                        Denoising Strength
                      </label>
                      <span className="rounded-md bg-alpine-50 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-alpine-800">
                        {strength.toFixed(2)}
                      </span>
                    </div>
                    <input
                      id="gen-strength"
                      type="range"
                      min={0.3}
                      max={0.7}
                      step={0.05}
                      value={strength}
                      onChange={(e) => setStrength(parseFloat(e.target.value))}
                      className="w-full accent-alpine-600"
                    />
                    <div className="flex justify-between font-mono text-[11px] text-ink-subtle">
                      <span>0.30 Faithful</span>
                      <span>0.50 Balanced</span>
                      <span>0.70 Bold</span>
                    </div>
                  </div>

                  {/* Variants per image stepper (1..3) */}
                  <div className="flex items-center justify-between rounded-control border border-ink/10 bg-paper/80 px-4 py-3">
                    <div>
                      <span className="block text-sm font-semibold text-ink">
                        Variants per image
                      </span>
                      <span className="text-xs text-ink-subtle">Allowed range: 1 to 3</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        disabled={variantsPerImage <= 1}
                        onClick={() => setVariantsPerImage((v) => Math.max(1, v - 1))}
                        className="sa-btn-secondary h-9 w-9 p-0"
                        aria-label="Decrease variants"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-6 text-center font-mono text-base font-semibold tabular-nums text-ink">
                        {variantsPerImage}
                      </span>
                      <button
                        type="button"
                        disabled={variantsPerImage >= 3}
                        onClick={() => setVariantsPerImage((v) => Math.min(3, v + 1))}
                        className="sa-btn-secondary h-9 w-9 p-0"
                        aria-label="Increase variants"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="border-t border-ink/10 pt-4">
                  <button
                    type="button"
                    disabled={submitting || files.length === 0}
                    onClick={handleStartGenerate}
                    className="sa-btn-primary w-full"
                  >
                    <Cpu className="h-4 w-4" aria-hidden="true" />
                    {submitting
                      ? 'Queueing GPU job…'
                      : `Run live generation (${files.length * variantsPerImage} variant${
                          files.length * variantsPerImage === 1 ? '' : 's'
                        })`}
                  </button>
                </div>
              </section>
            </div>
          )}
        </>
      )}

      {/* Lightbox with Prev/Next Stepping */}
      <Lightbox
        open={Boolean(activeLightboxItem)}
        onClose={() => setLightboxIdx(null)}
        title={
          activeLightboxItem
            ? `${activeLightboxItem.src.name} — ${activeLightboxItem.variant.mode || 'Generated'}`
            : ''
        }
        subtitle={
          activeLightboxItem
            ? `${activeLightboxItem.variant.axis} · ${activeLightboxItem.variant.variant_id}`
            : ''
        }
        beforeSrc={activeLightboxItem?.beforeSrc}
        afterSrc={activeLightboxItem?.afterSrc}
        afterLabel={activeLightboxItem?.variant?.mode || 'Generated'}
        currentIndex={lightboxIdx}
        totalCount={flattenedVariants.length}
        onPrev={
          flattenedVariants.length > 1
            ? () =>
                setLightboxIdx((i) =>
                  i === null ? 0 : (i - 1 + flattenedVariants.length) % flattenedVariants.length
                )
            : null
        }
        onNext={
          flattenedVariants.length > 1
            ? () => setLightboxIdx((i) => (i === null ? 0 : (i + 1) % flattenedVariants.length))
            : null
        }
      />
    </PageTransition>
  );
}