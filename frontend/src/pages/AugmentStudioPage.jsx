import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  Droplets,
  Eye,
  Flag,
  FolderOpen,
  History,
  ImagePlus,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Sun,
  Tag,
  Target,
  Trash2,
  UploadCloud,
  Wrench,
  XCircle,
  Zap,
} from 'lucide-react';
import { createAugmentJob, getJob, resolveFileUrl } from '../api/client';
import { createSeededRng, simulateAugmentationOnCanvas } from '../api/mockCanvas';
import { createMockMaterialSvg } from '../api/mockSvg';
import { useAppData } from '../context/AppDataContext';
import { useJobs } from '../context/JobsContext';
import { useToast } from '../context/ToastContext';
import { extractDroppedImages, extractInputImages } from '../utils/folderDrop';
import {
  formatBytes,
  formatClassLabel,
  formatEffectName,
  formatEta,
  formatTimestamp,
} from '../utils/formatters';
import { PageTransition } from '../components/ui/PageTransition';
import { AxisChip, ClassChip } from '../components/ui/ClassChip';
import { BasketballUploadCourt } from '../components/ui/BasketballUploadCourt';
import { BeforeAfterSlider } from '../components/ui/BeforeAfterSlider';
import { ProgressRing } from '../components/ui/ProgressRing';
import { TiltCard } from '../components/ui/TiltCard';
import { Lightbox } from '../components/ui/Lightbox';
import { SkeletonBox } from '../components/ui/Skeleton';
import { StatePanel } from '../components/ui/StatePanel';

const MAX_FILES = 50;
const UPLOAD_MODE_KEY = 'sortaugment_upload_mode';

const AXIS_META = {
  lighting: {
    icon: Sun,
    hint: 'Overhead flicker, conveyor shadows, low-light shifts, and glare.',
  },
  contamination: {
    icon: Droplets,
    hint: 'Food stains, camera dust/noise, motion blur, and belt occlusions.',
  },
  condition: {
    icon: Wrench,
    hint: 'Crushed geometry, creases, perspective tilt, and partial belt crops.',
  },
};

const FACILITY_PRESETS = [
  {
    id: 'night_glare',
    name: 'Night Shift Glare',
    hint: 'Low light + specular glare · 0.65',
    axes: ['lighting'],
    effects: ['low_light', 'glare'],
    intensity: 0.65,
    variants: 3,
  },
  {
    id: 'wet_belt',
    name: 'Wet / Dirty Belt',
    hint: 'Stains + blur + occlusion · 0.70',
    axes: ['contamination'],
    effects: ['stain_overlay', 'blur', 'occlusion_patches'],
    intensity: 0.7,
    variants: 4,
  },
  {
    id: 'compacted',
    name: 'Compacted Stream',
    hint: 'Crumple + rotation + tilt · 0.60',
    axes: ['condition'],
    effects: ['crumple', 'rotation', 'perspective'],
    intensity: 0.6,
    variants: 3,
  },
  {
    id: 'full_mrf',
    name: 'Full MRF Stress',
    hint: 'All 3 axes · balanced 0.55',
    axes: ['lighting', 'contamination', 'condition'],
    effects: [],
    intensity: 0.55,
    variants: 4,
  },
];

const WIZARD_STEPS = [
  { id: 1, label: 'Upload photos' },
  { id: 2, label: 'Configure variations' },
  { id: 3, label: 'Inspect & handoff' },
];

async function svgDataUrlToFile(svgDataUrl, filename) {
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
          if (!blob) {
            reject(new Error('Failed to create sample image.'));
            return;
          }
          resolve(new File([blob], filename, { type: 'image/jpeg' }));
        },
        'image/jpeg',
        0.9
      );
    };
    img.onerror = reject;
    img.src = svgDataUrl;
  });
}

export function AugmentStudioPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { classes, axes, isMock, loading: metaLoading, error: metaError, refresh } = useAppData();
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

  // Wizard step (1: Upload, 2: Configure, 3: Results)
  const [step, setStep] = useState(1);

  // Upload mode preference: 'court' (Basketball bunch) vs 'classic' (Quick Dropzone)
  const [uploadMode, setUploadMode] = useState(() => {
    try {
      return window.localStorage.getItem(UPLOAD_MODE_KEY) || 'court';
    } catch {
      return 'court';
    }
  });
  const [classicDragOver, setClassicDragOver] = useState(false);
  const classicDragDepthRef = useRef(0);

  // Step 1 state
  const [pendingBatch, setPendingBatch] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [bulkClassTarget, setBulkClassTarget] = useState('');
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const previewUrlsRef = useRef([]);

  // Step 2 configuration state
  const [selectedAxes, setSelectedAxes] = useState(['lighting', 'contamination']);
  const [selectedEffects, setSelectedEffects] = useState([]);
  const [intensity, setIntensity] = useState(0.5);
  const [variantsPerImage, setVariantsPerImage] = useState(3);
  const [seed, setSeed] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Step 2 Live Canvas Intensity Preview state
  const [livePreviewUrl, setLivePreviewUrl] = useState('');
  const [livePreviewEffect, setLivePreviewEffect] = useState('');
  const [livePreviewLoading, setLivePreviewLoading] = useState(false);

  // Step 3 state (supports reopening historical jobs via ?job=... or Recent Jobs picker)
  const [viewingJobId, setViewingJobId] = useState(() => searchParams.get('job') || '');
  const [loadedJob, setLoadedJob] = useState(null);
  const [loadingJob, setLoadingJob] = useState(false);
  const [loadJobError, setLoadJobError] = useState(null);

  const [flaggedVariantIds, setFlaggedVariantIds] = useState(() => new Set());
  const [activeSourceId, setActiveSourceId] = useState('all');
  const [lightboxIdx, setLightboxIdx] = useState(null);

  // Persist upload mode choice
  const switchUploadMode = (mode) => {
    setUploadMode(mode);
    try {
      window.localStorage.setItem(UPLOAD_MODE_KEY, mode);
    } catch {
      // Ignore storage failures
    }
    if (mode === 'classic' && pendingBatch.length > 0) {
      setUploads((prev) => [...prev, ...pendingBatch]);
      setPendingBatch([]);
    }
  };

  // Sync default bulk class once classes arrive
  useEffect(() => {
    if (!bulkClassTarget && classes.length > 0) {
      setBulkClassTarget(classes[0]);
    }
  }, [classes, bulkClassTarget]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  // Open job from ?job= query param (e.g. from TopBar pill or Quick Jump)
  useEffect(() => {
    const paramJob = searchParams.get('job');
    if (!paramJob) return;

    setViewingJobId(paramJob);
    setStep(3);
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
        setActiveSourceId('all');
        setFlaggedVariantIds(new Set());
        if (res.status === 'queued' || res.status === 'running') {
          trackJob(res.job_id, res.type || 'augment');
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

  // Keep Step 3 synced with global background poller when viewing the active job
  const currentJob = viewingJobId && viewingJobId === activeJobId ? activeJob || loadedJob : loadedJob;
  const isCurrentJobRunning =
    Boolean(viewingJobId && viewingJobId === activeJobId && polling) ||
    currentJob?.status === 'queued' ||
    currentJob?.status === 'running';

  // Live Canvas Preview in Step 2 (reuses browser mockCanvas for instant visual feedback)
  const previewEffectId = useMemo(() => {
    if (selectedEffects.length > 0) return selectedEffects[0];
    for (const axId of selectedAxes) {
      const found = axes.find((a) => a.id === axId);
      if (found?.effects?.length > 0) return found.effects[0].id;
    }
    return null;
  }, [selectedAxes, selectedEffects, axes]);

  useEffect(() => {
    if (step !== 2 || uploads.length === 0 || !previewEffectId) {
      setLivePreviewUrl('');
      setLivePreviewEffect('');
      return undefined;
    }

    let cancelled = false;
    setLivePreviewLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const rng = createSeededRng(seed.trim() !== '' ? Number(seed) : 2026);
        const { dataUrl } = await simulateAugmentationOnCanvas({
          sourceDataUrl: uploads[0].previewUrl,
          effect: previewEffectId,
          intensity,
          rng,
        });
        if (!cancelled) {
          setLivePreviewUrl(dataUrl);
          setLivePreviewEffect(previewEffectId);
        }
      } catch {
        if (!cancelled) setLivePreviewUrl('');
      } finally {
        if (!cancelled) setLivePreviewLoading(false);
      }
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [step, uploads, previewEffectId, intensity, seed]);

  const getAllExistingNames = useCallback(() => {
    const names = new Set();
    uploads.forEach((u) => names.add(u.file.name));
    pendingBatch.forEach((p) => names.add(p.file.name));
    return names;
  }, [uploads, pendingBatch]);

  const ingestExtracted = useCallback(
    (extracted) => {
      if (!extracted.length) {
        addToast({
          title: 'No supported images found',
          description: 'Drop JPG, PNG, or WebP files (or folders containing them).',
          tone: 'warning',
        });
        return;
      }

      const remainingSlots = MAX_FILES - uploads.length - pendingBatch.length;
      if (remainingSlots <= 0) {
        addToast({
          title: `Maximum ${MAX_FILES} images reached`,
          description: 'Remove an image before adding more.',
          tone: 'warning',
        });
        return;
      }

      const accepted = extracted.slice(0, remainingSlots);
      if (extracted.length > remainingSlots) {
        addToast({
          title: `Imported ${accepted.length} of ${extracted.length} images`,
          description: `API limit is ${MAX_FILES} images per augmentation job.`,
          tone: 'warning',
        });
      }

      const nextItems = accepted.map((item, idx) => {
        const previewUrl = URL.createObjectURL(item.file);
        previewUrlsRef.current.push(previewUrl);
        return {
          id: `${Date.now()}_${idx}_${item.file.name}`,
          file: item.file,
          previewUrl,
          label: item.label || 'unlabeled',
          inferredFromFolder: item.inferredFromFolder,
        };
      });

      const inferredCount = nextItems.filter((i) => i.inferredFromFolder).length;

      if (uploadMode === 'classic') {
        setUploads((prev) => [...prev, ...nextItems]);
        addToast({
          title: `Queued ${nextItems.length} image${nextItems.length === 1 ? '' : 's'}`,
          description:
            inferredCount > 0
              ? `Auto-assigned folder labels for ${inferredCount} file${inferredCount === 1 ? '' : 's'}.`
              : 'Ready to configure variations.',
          tone: 'success',
        });
      } else {
        setPendingBatch((prev) => {
          const total = prev.length + nextItems.length;
          addToast({
            title: `Packed ${total} file${total === 1 ? '' : 's'} into the ball`,
            description:
              inferredCount > 0
                ? `Auto-labeled ${inferredCount} from subfolders. Shoot once to queue the bunch!`
                : 'Drag back from the ball and shoot once to queue all files.',
            tone: 'info',
          });
          return [...prev, ...nextItems];
        });
      }
    },
    [addToast, pendingBatch.length, uploadMode, uploads.length]
  );

  const handleDropDataTransfer = useCallback(
    async (dataTransfer) => {
      const existingNames = getAllExistingNames();
      const extracted = await extractDroppedImages(dataTransfer, classes, existingNames);
      ingestExtracted(extracted);
    },
    [classes, getAllExistingNames, ingestExtracted]
  );

  const handleFileInput = (e) => {
    const existingNames = getAllExistingNames();
    const extracted = extractInputImages(e.target.files, classes, existingNames);
    ingestExtracted(extracted);
    e.target.value = '';
  };

  const handleLoadDemoSamples = async () => {
    const sampleClasses =
      classes.length >= 3 ? classes.slice(0, 3) : ['plastic', 'cardboard', 'metal'];
    const existingNames = getAllExistingNames();
    try {
      const generated = await Promise.all(
        sampleClasses.map(async (cls, i) => {
          const svg = createMockMaterialSvg({ cls, variantTag: 'ORIGINAL', seed: 40 + i });
          let filename = `demo_${cls}_0${i + 1}.jpg`;
          if (existingNames.has(filename)) {
            filename = `demo_${cls}_${Date.now() % 1000}_${i}.jpg`;
          }
          existingNames.add(filename);
          const file = await svgDataUrlToFile(svg, filename);
          return { file, label: cls, inferredFromFolder: false };
        })
      );
      ingestExtracted(generated);
    } catch {
      addToast({ title: 'Could not generate sample images', tone: 'error' });
    }
  };

  const handleBatchScored = useCallback(() => {
    setPendingBatch((currentBatch) => {
      if (currentBatch.length === 0) return currentBatch;
      setUploads((prevUploads) => [...prevUploads, ...currentBatch]);
      addToast({
        title: `Swish! Queued ${currentBatch.length} image${currentBatch.length === 1 ? '' : 's'}`,
        description: 'Verify labels below or continue to Step 2.',
        tone: 'success',
      });
      return [];
    });
  }, [addToast]);

  const handleClearPending = useCallback(() => {
    setPendingBatch((prev) => {
      prev.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
  }, []);

  const removeUpload = (id) => {
    setUploads((prev) => {
      const target = prev.find((u) => u.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((u) => u.id !== id);
    });
  };

  const updateUploadLabel = (id, nextLabel) => {
    setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, label: nextLabel } : u)));
  };

  // Bulk class assignment helpers
  const applyBulkClass = (onlyUnlabeled) => {
    if (!bulkClassTarget) return;
    let changed = 0;
    setUploads((prev) =>
      prev.map((u) => {
        if (onlyUnlabeled && u.label && u.label !== 'unlabeled') return u;
        changed += 1;
        return { ...u, label: bulkClassTarget, inferredFromFolder: false };
      })
    );
    addToast({
      title: `Assigned "${formatClassLabel(bulkClassTarget)}"`,
      description: onlyUnlabeled
        ? `Updated ${changed} unlabeled image${changed === 1 ? '' : 's'}.`
        : `Updated all ${uploads.length} queued image${uploads.length === 1 ? '' : 's'}.`,
      tone: 'success',
    });
  };

  const applyPreset = (preset) => {
    const validAxes = preset.axes.filter((id) => axes.some((a) => a.id === id));
    const allAvailableEffects = new Set(axes.flatMap((a) => (a.effects || []).map((e) => e.id)));
    const validEffects = preset.effects.filter((id) => allAvailableEffects.has(id));

    setSelectedAxes(validAxes.length > 0 ? validAxes : preset.axes);
    setSelectedEffects(validEffects);
    setIntensity(preset.intensity);
    setVariantsPerImage(preset.variants);
    addToast({
      title: `Applied preset: ${preset.name}`,
      description: preset.hint,
      tone: 'info',
    });
  };

  const toggleAxis = (axisId) => {
    setSelectedAxes((prev) => {
      const exists = prev.includes(axisId);
      const next = exists ? prev.filter((id) => id !== axisId) : [...prev, axisId];
      if (exists) {
        const axisObj = axes.find((a) => a.id === axisId);
        const removedEffectIds = new Set((axisObj?.effects || []).map((ef) => ef.id));
        setSelectedEffects((efPrev) => efPrev.filter((id) => !removedEffectIds.has(id)));
      }
      return next;
    });
  };

  const toggleEffect = (axisId, effectId) => {
    if (!selectedAxes.includes(axisId)) {
      setSelectedAxes((prev) => [...prev, axisId]);
    }
    setSelectedEffects((prev) =>
      prev.includes(effectId) ? prev.filter((id) => id !== effectId) : [...prev, effectId]
    );
  };

  const activeAxisObjects = useMemo(
    () => axes.filter((a) => selectedAxes.includes(a.id)),
    [axes, selectedAxes]
  );

  const handleRunAugmentation = async () => {
    if (uploads.length === 0) {
      addToast({ title: 'Queue at least one image first', tone: 'warning' });
      setStep(1);
      return;
    }
    if (selectedAxes.length === 0) {
      addToast({ title: 'Choose at least one augmentation axis', tone: 'warning' });
      return;
    }

    setSubmitting(true);
    try {
      const labelsMap = {};
      uploads.forEach((u) => {
        if (u.label && u.label !== 'unlabeled') {
          labelsMap[u.file.name] = u.label;
        }
      });

      const response = await createAugmentJob({
        files: uploads.map((u) => u.file),
        axes: selectedAxes,
        effects: selectedEffects.length > 0 ? selectedEffects : null,
        intensity,
        variantsPerImage,
        seed: seed.trim() === '' ? null : Number(seed),
        labels: labelsMap,
      });

      setViewingJobId(response.job_id);
      setLoadedJob(null);
      setFlaggedVariantIds(new Set());
      setActiveSourceId('all');
      setSearchParams({ job: response.job_id }, { replace: true });
      setStep(3);
      trackJob(response.job_id, 'augment');
    } catch (err) {
      addToast({
        title: 'Could not start augmentation',
        description: err?.message || 'Check your inputs and try again.',
        tone: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReopenPastJob = (jobIdToOpen) => {
    if (!jobIdToOpen) return;
    setSearchParams({ job: jobIdToOpen });
  };

  // Flattened variant cards for Step 3 grid
  const resultSources = currentJob?.result?.sources || [];
  const allVariantCards = useMemo(() => {
    const list = [];
    resultSources.forEach((src) => {
      if (activeSourceId !== 'all' && src.source_id !== activeSourceId) return;
      (src.variants || []).forEach((variant) => {
        list.push({
          source: src,
          variant,
          beforeSrc: resolveFileUrl(src.url),
          afterSrc: resolveFileUrl(variant.url),
        });
      });
    });
    return list;
  }, [resultSources, activeSourceId]);

  const toggleFlagVariant = (variantId) => {
    setFlaggedVariantIds((prev) => {
      const next = new Set(prev);
      if (next.has(variantId)) next.delete(variantId);
      else next.add(variantId);
      return next;
    });
  };

  const activeLightboxCard =
    lightboxIdx !== null && allVariantCards[lightboxIdx] ? allVariantCards[lightboxIdx] : null;

  const recentAugmentJobs = useMemo(
    () => recentJobs.filter((j) => j.status === 'done'),
    [recentJobs]
  );

  const unlabeledCount = useMemo(
    () => uploads.filter((u) => !u.label || u.label === 'unlabeled').length,
    [uploads]
  );

  if (metaError) {
    return (
      <PageTransition>
        <StatePanel
          variant="error"
          title="Could not load effects and classes"
          description={metaError}
          actionLabel="Retry API"
          onAction={refresh}
        />
      </PageTransition>
    );
  }

  return (
    <PageTransition className="space-y-6">
      {/* 3-Step Wizard Header + Recent Jobs Reopen Switcher */}
      <div className="sa-card flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between md:px-6">
        <ol className="flex flex-wrap items-center gap-2 sm:gap-3" aria-label="Augment studio steps">
          {WIZARD_STEPS.map((s, idx) => {
            const isCurrent = step === s.id;
            const isComplete = step > s.id;
            const canClick =
              s.id === 1 ||
              (s.id === 2 && uploads.length > 0) ||
              (s.id === 3 && Boolean(viewingJobId));

            return (
              <li key={s.id} className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!canClick}
                  onClick={() => canClick && setStep(s.id)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                    isCurrent
                      ? 'border-alpine-600 bg-alpine-600 text-surface shadow-sm'
                      : isComplete
                        ? 'border-alpine-200 bg-alpine-50 text-alpine-800 hover:bg-alpine-100'
                        : 'border-ink/10 bg-paper text-ink-subtle disabled:cursor-not-allowed disabled:opacity-60'
                  }`}
                >
                  <span className="font-mono text-[11px]">
                    {isComplete ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : `0${s.id}`}
                  </span>
                  <span>{s.label}</span>
                </button>
                {idx < WIZARD_STEPS.length - 1 && (
                  <span className="hidden h-px w-5 bg-ink/15 sm:block" aria-hidden="true" />
                )}
              </li>
            );
          })}
        </ol>

        <div className="flex flex-wrap items-center gap-3">
          {recentAugmentJobs.length > 0 && (
            <div className="flex items-center gap-1.5">
              <History className="h-3.5 w-3.5 text-ink-subtle" aria-hidden="true" />
              <label htmlFor="recent-job-reopen" className="sr-only">
                Reopen a completed job
              </label>
              <select
                id="recent-job-reopen"
                value={step === 3 ? viewingJobId : ''}
                onChange={(e) => handleReopenPastJob(e.target.value)}
                className="rounded-full border border-ink/15 bg-paper px-3 py-1 font-mono text-[11px] text-ink focus:border-alpine-600 focus:outline-none"
              >
                <option value="">Reopen past job…</option>
                {recentAugmentJobs.map((j) => (
                  <option key={j.job_id} value={j.job_id}>
                    {j.job_id} · {j.n_variants} var · {formatTimestamp(j.created_at)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="font-mono text-xs text-ink-subtle">
            {uploads.length}/{MAX_FILES} queued
            {pendingBatch.length > 0 ? ` · ${pendingBatch.length} in ball` : ''}
          </div>
        </div>
      </div>

      {/* Hidden native inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileInput}
        className="hidden"
        aria-label="Select image files"
      />
      <input
        ref={folderInputRef}
        type="file"
        accept="image/*"
        multiple
        webkitdirectory=""
        directory=""
        onChange={handleFileInput}
        className="hidden"
        aria-label="Select folder of labeled images"
      />

      {/* STEP 1: UPLOAD (Court vs Quick Dropzone Switch + Bulk Class Assignment) */}
      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.section
            key="step-1"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* Upload Mode Switcher Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-ink-muted">
                Choose your upload workflow — subfolder names become class labels in both modes.
              </p>
              <div
                className="inline-flex items-center rounded-full border border-ink/12 bg-surface/90 p-0.5 shadow-sm"
                role="group"
                aria-label="Upload interface mode"
              >
                <button
                  type="button"
                  onClick={() => switchUploadMode('court')}
                  aria-pressed={uploadMode === 'court'}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    uploadMode === 'court'
                      ? 'bg-alpine-600 text-surface shadow-sm'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  <Target className="h-3.5 w-3.5" aria-hidden="true" />
                  Bunch-to-Hoop
                </button>
                <button
                  type="button"
                  onClick={() => switchUploadMode('classic')}
                  aria-pressed={uploadMode === 'classic'}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    uploadMode === 'classic'
                      ? 'bg-alpine-600 text-surface shadow-sm'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />
                  Quick Dropzone
                </button>
              </div>
            </div>

            {uploadMode === 'court' ? (
              <BasketballUploadCourt
                pendingBatch={pendingBatch}
                queuedCount={uploads.length}
                maxFiles={MAX_FILES}
                knownClasses={classes}
                onBatchScored={handleBatchScored}
                onClearPending={handleClearPending}
                onPickFiles={() => fileInputRef.current?.click()}
                onPickFolder={() => folderInputRef.current?.click()}
                onLoadDemoSamples={isMock ? handleLoadDemoSamples : null}
                onDropDataTransfer={handleDropDataTransfer}
              />
            ) : (
              /* Classic Fast-Production Dropzone */
              <motion.div
                animate={
                  classicDragOver
                    ? { scale: 1.01, borderColor: 'rgba(2, 116, 179, 0.85)' }
                    : { scale: 1, borderColor: 'rgba(15, 30, 46, 0.16)' }
                }
                transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  classicDragDepthRef.current += 1;
                  setClassicDragOver(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  classicDragDepthRef.current = Math.max(0, classicDragDepthRef.current - 1);
                  if (classicDragDepthRef.current === 0) setClassicDragOver(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  classicDragDepthRef.current = 0;
                  setClassicDragOver(false);
                  handleDropDataTransfer(e.dataTransfer);
                }}
                className={`flex flex-col items-center justify-center rounded-panel border-2 border-dashed px-6 py-12 text-center backdrop-blur-md transition-colors ${
                  classicDragOver ? 'bg-alpine-50/85' : 'bg-surface/85'
                }`}
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-card border border-alpine-200 bg-alpine-50 text-alpine-700">
                  <UploadCloud className="h-6 w-6" aria-hidden="true" />
                </div>
                <h2 className="mt-4 font-display text-xl font-semibold text-ink">
                  Drop conveyor line photos or class folders
                </h2>
                <p className="mt-1.5 max-w-lg text-sm text-ink-muted">
                  Direct queue mode — up to {MAX_FILES} images per job. Drop folders like{' '}
                  <code className="rounded bg-recessed px-1.5 py-0.5 font-mono text-xs">
                    plastic/
                  </code>{' '}
                  to auto-assign class labels.
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="sa-btn-primary"
                  >
                    <ImagePlus className="h-4 w-4" aria-hidden="true" />
                    Select images
                  </button>
                  <button
                    type="button"
                    onClick={() => folderInputRef.current?.click()}
                    className="sa-btn-secondary"
                  >
                    <FolderOpen className="h-4 w-4" aria-hidden="true" />
                    Select class folder
                  </button>
                  {isMock && (
                    <button
                      type="button"
                      onClick={handleLoadDemoSamples}
                      className="sa-btn-ghost text-alpine-700 hover:bg-alpine-50"
                    >
                      <Sparkles className="h-4 w-4" aria-hidden="true" />
                      Load 3 sample photos
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {/* Queued Source Images + Bulk Class Assignment Bar */}
            {uploads.length > 0 ? (
              <div className="sa-card overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 px-5 py-4">
                  <div>
                    <h3 className="font-display text-base font-semibold text-ink">
                      Queued Source Images ({uploads.length})
                    </h3>
                    <p className="text-xs text-ink-subtle">
                      Verify individual labels or bulk-assign below before configuring variations.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        uploads.forEach((u) => URL.revokeObjectURL(u.previewUrl));
                        setUploads([]);
                      }}
                      className="sa-btn-ghost text-err-text hover:bg-err-bg"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Clear all
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="sa-btn-primary"
                    >
                      Continue to configure
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {/* Bulk Class Assignment Strip */}
                {classes.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 bg-paper/75 px-5 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Tag className="h-3.5 w-3.5 text-alpine-700" aria-hidden="true" />
                      <span className="text-xs font-medium text-ink">Bulk label:</span>
                      <select
                        value={bulkClassTarget}
                        onChange={(e) => setBulkClassTarget(e.target.value)}
                        aria-label="Target class for bulk assignment"
                        className="rounded-lg border border-ink/15 bg-surface px-2.5 py-1 text-xs font-medium text-ink focus:border-alpine-600 focus:outline-none"
                      >
                        {classes.map((cls) => (
                          <option key={cls} value={cls}>
                            {formatClassLabel(cls)}
                          </option>
                        ))}
                        <option value="unlabeled">Unlabeled</option>
                      </select>
                      <button
                        type="button"
                        disabled={unlabeledCount === 0}
                        onClick={() => applyBulkClass(true)}
                        className="sa-btn-secondary px-2.5 py-1 text-xs"
                      >
                        Set unlabeled ({unlabeledCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => applyBulkClass(false)}
                        className="sa-btn-ghost px-2.5 py-1 text-xs text-alpine-700 hover:bg-alpine-50"
                      >
                        Apply to all ({uploads.length})
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
                  {uploads.map((item) => {
                    const labelOptions = Array.from(
                      new Set(['unlabeled', ...classes, item.label].filter(Boolean))
                    );
                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 rounded-control border border-ink/10 bg-paper/75 p-2.5"
                      >
                        <img
                          src={item.previewUrl}
                          alt={item.file.name}
                          className="h-16 w-16 shrink-0 rounded-lg border border-ink/10 object-cover"
                        />
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <p
                              className="truncate text-xs font-medium text-ink"
                              title={item.file.name}
                            >
                              {item.file.name}
                            </p>
                            <button
                              type="button"
                              onClick={() => removeUpload(item.id)}
                              className="rounded p-0.5 text-ink-subtle hover:bg-recessed hover:text-err-text"
                              aria-label={`Remove ${item.file.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <p className="font-mono text-[11px] text-ink-subtle">
                            {formatBytes(item.file.size)}
                            {item.inferredFromFolder ? ' · from folder' : ''}
                          </p>
                          <label className="block">
                            <span className="sr-only">Class label for {item.file.name}</span>
                            <select
                              value={item.label}
                              onChange={(e) => updateUploadLabel(item.id, e.target.value)}
                              className="w-full rounded-lg border border-ink/15 bg-surface px-2 py-1 text-xs font-medium text-ink focus:border-alpine-600 focus:outline-none"
                            >
                              {labelOptions.map((opt) => (
                                <option key={opt} value={opt}>
                                  {formatClassLabel(opt)}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <StatePanel
                title="No photos in your training queue yet"
                description={
                  pendingBatch.length > 0
                    ? `Your ${pendingBatch.length} file${
                        pendingBatch.length === 1 ? '' : 's'
                      } are packed inside the ball above — shoot the hoop (or click Auto-Swish) to queue them!`
                    : 'Select a folder or drop conveyor photos above to get started.'
                }
              />
            )}
          </motion.section>
        )}

        {/* STEP 2: CONFIGURE (Facility Presets + Axes + Live Intensity Preview) */}
        {step === 2 && (
          <motion.section
            key="step-2"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* One-Click Facility Presets */}
            <div className="sa-card space-y-3 p-5">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-alpine-600" aria-hidden="true" />
                <h2 className="font-display text-base font-semibold text-ink">
                  Quick Facility Presets
                </h2>
                <span className="text-xs text-ink-subtle">
                  Apply common sorting-line stress profiles in one click
                </span>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                {FACILITY_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className="rounded-control border border-ink/12 bg-paper/80 p-3 text-left transition-all hover:border-alpine-300 hover:bg-alpine-50/70 hover:shadow-sm"
                  >
                    <p className="font-display text-sm font-semibold text-ink">{preset.name}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-ink-subtle">{preset.hint}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Big 3D Hover-Moving Axis Cards */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="font-display text-xl font-semibold text-ink">
                    1. Choose Variation Axes
                  </h2>
                  <p className="text-sm text-ink-muted">
                    Select one or more facility stress axes loaded from{' '}
                    <code className="font-mono text-xs">/api/effects</code>.
                  </p>
                </div>
                <span className="font-mono text-xs text-ink-subtle">
                  {selectedAxes.length} of {axes.length} axes active
                </span>
              </div>

              <div className="grid gap-5 md:grid-cols-3">
                {metaLoading
                  ? [0, 1, 2].map((i) => <div key={i} className="sa-card h-40 p-5 sa-skeleton" />)
                  : axes.map((axis) => {
                      const active = selectedAxes.includes(axis.id);
                      const meta = AXIS_META[axis.id] || {
                        icon: Sparkles,
                        hint: 'Facility stress variations.',
                      };
                      const Icon = meta.icon;
                      return (
                        <TiltCard
                          key={axis.id}
                          maxTilt={7}
                          className={`p-0 ${
                            active
                              ? 'border-alpine-500 bg-alpine-50/60 ring-1 ring-alpine-500/25'
                              : ''
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => toggleAxis(axis.id)}
                            aria-pressed={active}
                            className="flex h-full w-full flex-col justify-between p-6 text-left"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div
                                className={`flex h-11 w-11 items-center justify-center rounded-control border ${
                                  active
                                    ? 'border-alpine-600 bg-alpine-600 text-surface shadow-sm'
                                    : 'border-ink/10 bg-paper text-ink-muted'
                                }`}
                              >
                                <Icon className="h-5 w-5" aria-hidden="true" />
                              </div>
                              <span
                                className={`rounded-full px-2.5 py-0.5 font-mono text-[11px] font-medium ${
                                  active
                                    ? 'bg-alpine-600 text-surface'
                                    : 'bg-recessed text-ink-subtle'
                                }`}
                              >
                                {active ? 'Active' : `${axis.effects.length} effects`}
                              </span>
                            </div>
                            <div className="mt-5">
                              <h3 className="font-display text-lg font-semibold text-ink">
                                {axis.label}
                              </h3>
                              <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
                                {meta.hint}
                              </p>
                            </div>
                          </button>
                        </TiltCard>
                      );
                    })}
              </div>
            </div>

            {/* Specific Effects + Live Intensity Preview Side-by-Side */}
            <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-5">
                {/* Effect Chips */}
                <div className="sa-card space-y-4 p-5 md:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-display text-base font-semibold text-ink">
                        2. Fine-Tune Specific Effects{' '}
                        <span className="font-sans text-xs font-normal text-ink-subtle">
                          (optional)
                        </span>
                      </h3>
                      <p className="text-xs text-ink-muted">
                        Leave unselected to sample across all effects in your active axes, or pin
                        exact effects below.
                      </p>
                    </div>
                    {selectedEffects.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedEffects([])}
                        className="sa-btn-ghost text-xs"
                      >
                        Use all axis effects
                      </button>
                    )}
                  </div>

                  {activeAxisObjects.length === 0 ? (
                    <p className="rounded-control border border-amberwarn-border bg-amberwarn-bg px-3.5 py-2.5 text-xs text-amberwarn-text">
                      Select at least one axis above to see available effects.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {activeAxisObjects.map((axis) => (
                        <div key={axis.id} className="space-y-2">
                          <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                            {axis.label}
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {axis.effects.map((ef) => {
                              const pinned = selectedEffects.includes(ef.id);
                              return (
                                <motion.button
                                  key={ef.id}
                                  layout
                                  type="button"
                                  onClick={() => toggleEffect(axis.id, ef.id)}
                                  aria-pressed={pinned}
                                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                                    pinned
                                      ? 'border-alpine-600 bg-alpine-600 text-surface shadow-sm'
                                      : 'border-ink/15 bg-paper text-ink hover:border-alpine-300'
                                  }`}
                                >
                                  {pinned && <Check className="h-3 w-3" aria-hidden="true" />}
                                  <span>{ef.label}</span>
                                </motion.button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Intensity, Variants & Seed Controls */}
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="sa-card space-y-3 p-4">
                    <div className="flex items-center justify-between">
                      <label htmlFor="intensity-slider" className="text-sm font-semibold text-ink">
                        Intensity
                      </label>
                      <span className="rounded-md bg-alpine-50 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-alpine-800">
                        {intensity.toFixed(2)}
                      </span>
                    </div>
                    <input
                      id="intensity-slider"
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={intensity}
                      onChange={(e) => setIntensity(parseFloat(e.target.value))}
                      className="w-full accent-alpine-600"
                    />
                    <div className="flex justify-between font-mono text-[10px] text-ink-subtle">
                      <span>0.00</span>
                      <span>0.50</span>
                      <span>1.00</span>
                    </div>
                  </div>

                  <div className="sa-card flex flex-col justify-between space-y-3 p-4">
                    <div>
                      <span className="text-sm font-semibold text-ink">Variants / img</span>
                      <p className="text-[11px] text-ink-subtle">Range: 1 to 10</p>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => setVariantsPerImage((v) => Math.max(1, v - 1))}
                        disabled={variantsPerImage <= 1}
                        className="sa-btn-secondary h-9 w-9 p-0"
                        aria-label="Decrease variants per image"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="min-w-[2rem] text-center font-mono text-lg font-semibold tabular-nums text-ink">
                        {variantsPerImage}
                      </span>
                      <button
                        type="button"
                        onClick={() => setVariantsPerImage((v) => Math.min(10, v + 1))}
                        disabled={variantsPerImage >= 10}
                        className="sa-btn-secondary h-9 w-9 p-0"
                        aria-label="Increase variants per image"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="sa-card flex flex-col justify-between space-y-3 p-4">
                    <div>
                      <label htmlFor="seed-input" className="text-sm font-semibold text-ink">
                        Seed <span className="font-normal text-ink-subtle">(opt)</span>
                      </label>
                      <p className="text-[11px] text-ink-subtle">Reproducible runs</p>
                    </div>
                    <input
                      id="seed-input"
                      type="number"
                      inputMode="numeric"
                      placeholder="e.g. 2026"
                      value={seed}
                      onChange={(e) => setSeed(e.target.value)}
                      className="sa-input py-1.5 font-mono text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Live Intensity Preview Card */}
              <div className="sa-card flex flex-col justify-between space-y-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Eye className="h-4 w-4 text-alpine-600" aria-hidden="true" />
                      <h3 className="font-display text-base font-semibold text-ink">
                        Live Intensity Preview
                      </h3>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      Approximate browser preview on{' '}
                      <span className="font-mono text-ink">
                        {uploads[0]?.file?.name || 'first photo'}
                      </span>
                      .
                    </p>
                  </div>
                  {livePreviewEffect && (
                    <span className="rounded-full border border-alpine-200 bg-alpine-50 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-alpine-800">
                      {formatEffectName(livePreviewEffect)}
                    </span>
                  )}
                </div>

                {uploads[0] && livePreviewUrl ? (
                  <div className="relative">
                    <BeforeAfterSlider
                      beforeSrc={uploads[0].previewUrl}
                      afterSrc={livePreviewUrl}
                      beforeLabel="Original"
                      afterLabel={`Preview (${intensity.toFixed(2)})`}
                      alt="Live augmentation intensity preview"
                      allowZoom={false}
                    />
                    {livePreviewLoading && (
                      <span className="pointer-events-none absolute bottom-2.5 left-2.5 rounded-md bg-surface/90 px-2 py-0.5 font-mono text-[10px] text-alpine-800 shadow-sm">
                        Updating…
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center rounded-control border border-dashed border-ink/15 bg-paper text-center text-xs text-ink-muted">
                    Select at least one axis to preview intensity
                  </div>
                )}

                <p className="font-mono text-[11px] text-ink-subtle">
                  Drag the Intensity slider or pin an effect chip to calibrate strength before
                  running the batch.
                </p>
              </div>
            </div>

            {/* Footer action bar */}
            <div className="sa-panel flex flex-wrap items-center justify-between gap-4 px-5 py-4">
              <button type="button" onClick={() => setStep(1)} className="sa-btn-secondary">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to upload
              </button>

              <div className="flex flex-wrap items-center gap-4">
                <span className="font-mono text-xs text-ink-muted">
                  {uploads.length} source{uploads.length === 1 ? '' : 's'} × {variantsPerImage} ={' '}
                  <strong className="text-ink">{uploads.length * variantsPerImage} variants</strong>
                </span>
                <button
                  type="button"
                  disabled={submitting || selectedAxes.length === 0 || uploads.length === 0}
                  onClick={handleRunAugmentation}
                  className="sa-btn-primary"
                >
                  {submitting ? 'Submitting job…' : 'Generate augmented set'}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </motion.section>
        )}

        {/* STEP 3: PROGRESS & RESULTS */}
        {step === 3 && (
          <motion.section
            key="step-3"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {loadingJob ? (
              <SkeletonBox className="h-64 w-full" />
            ) : loadJobError ? (
              <StatePanel
                variant="error"
                title="Could not load job"
                description={loadJobError}
                actionLabel="Start new run"
                onAction={() => {
                  setSearchParams({}, { replace: true });
                  setStep(uploads.length > 0 ? 2 : 1);
                }}
              />
            ) : isCurrentJobRunning ? (
              <div className="sa-card flex flex-col items-center justify-center px-6 py-12 text-center">
                <ProgressRing
                  value={currentJob?.progress?.done || 0}
                  total={
                    currentJob?.progress?.total || Math.max(1, uploads.length * variantsPerImage)
                  }
                  sublabel={`${currentJob?.progress?.done || 0}/${
                    currentJob?.progress?.total || uploads.length * variantsPerImage
                  }`}
                />
                <h2 className="mt-5 font-display text-xl font-semibold text-ink">
                  {currentJob?.status === 'queued'
                    ? 'Queued for augmentation…'
                    : 'Applying facility variations…'}
                </h2>
                <p className="mt-1.5 font-mono text-xs text-ink-muted">
                  Job {viewingJobId} · {formatEta(currentJob?.eta_seconds)}
                </p>
                <p className="mt-1 text-xs text-ink-subtle">
                  You can freely explore other pages — progress stays pinned in the top bar.
                </p>
                <button
                  type="button"
                  disabled={cancelling}
                  onClick={cancelActiveJob}
                  className="sa-btn-secondary mt-6 border-err-border text-err-text hover:bg-err-bg"
                >
                  <XCircle className="h-4 w-4" aria-hidden="true" />
                  {cancelling ? 'Cancelling…' : 'Cancel job'}
                </button>
              </div>
            ) : currentJob?.status === 'failed' || currentJob?.status === 'cancelled' ? (
              <StatePanel
                variant={currentJob.status === 'failed' ? 'error' : 'empty'}
                title={currentJob.status === 'failed' ? 'Augmentation job failed' : 'Job cancelled'}
                description={
                  activeError ||
                  currentJob.error ||
                  'This job was stopped before completion. Adjust your parameters and try again.'
                }
                actionLabel="Back to configuration"
                onAction={() => {
                  setSearchParams({}, { replace: true });
                  setStep(uploads.length > 0 ? 2 : 1);
                }}
              />
            ) : currentJob?.status === 'done' ? (
              <>
                <div className="sa-card flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-xl font-semibold text-ink">
                        Augmented Results
                      </h2>
                      <span className="rounded-full border border-alpine-200 bg-alpine-50 px-2.5 py-0.5 font-mono text-xs font-medium text-alpine-800">
                        {currentJob.job_id}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">
                      Drag sliders or press arrow keys to inspect before/after. Flag interesting
                      variants to highlight them in Classifier Check (
                      <strong className="font-mono text-ink">
                        {flaggedVariantIds.size} flagged
                      </strong>
                      ).
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSearchParams({}, { replace: true });
                        setStep(uploads.length > 0 ? 2 : 1);
                      }}
                      className="sa-btn-ghost text-xs"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      New run
                    </button>
                    {flaggedVariantIds.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setFlaggedVariantIds(new Set())}
                        className="sa-btn-secondary text-xs"
                      >
                        Clear flags ({flaggedVariantIds.size})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const params = new URLSearchParams({ job: currentJob.job_id });
                        if (flaggedVariantIds.size > 0) {
                          params.set('flagged', Array.from(flaggedVariantIds).join(','));
                        }
                        navigate(`/classify?${params.toString()}`);
                      }}
                      className="sa-btn-secondary border-alpine-200 bg-alpine-50 text-alpine-800 hover:bg-alpine-100"
                    >
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                      Check classifier
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/export?job=${encodeURIComponent(currentJob.job_id)}`)
                      }
                      className="sa-btn-primary"
                    >
                      <Download className="h-4 w-4" aria-hidden="true" />
                      Export full job
                    </button>
                  </div>
                </div>

                {/* Source filter tabs */}
                {resultSources.length > 1 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveSourceId('all')}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                        activeSourceId === 'all'
                          ? 'border-alpine-600 bg-alpine-600 text-surface'
                          : 'border-ink/15 bg-surface text-ink-muted hover:text-ink'
                      }`}
                    >
                      All sources ({resultSources.length})
                    </button>
                    {resultSources.map((src) => (
                      <button
                        key={src.source_id}
                        type="button"
                        onClick={() => setActiveSourceId(src.source_id)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                          activeSourceId === src.source_id
                            ? 'border-alpine-600 bg-alpine-600 text-surface'
                            : 'border-ink/15 bg-surface text-ink-muted hover:text-ink'
                        }`}
                      >
                        <span className="max-w-[140px] truncate">{src.name}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Results Grid */}
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {allVariantCards.map(({ source, variant, beforeSrc, afterSrc }, idx) => {
                    const isFlagged = flaggedVariantIds.has(variant.variant_id);
                    const paramEntries = Object.entries(variant.params || {});

                    return (
                      <motion.article
                        key={variant.variant_id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`sa-card flex flex-col overflow-hidden transition-all ${
                          isFlagged
                            ? 'border-amberwarn-border ring-1 ring-amberwarn-accent/35'
                            : ''
                        }`}
                      >
                        <div className="p-3 pb-0">
                          <BeforeAfterSlider
                            beforeSrc={beforeSrc}
                            afterSrc={afterSrc}
                            beforeLabel="Original"
                            afterLabel={formatEffectName(variant.effect)}
                            alt={`${source.name} ${variant.effect}`}
                          />
                        </div>

                        <div className="flex flex-1 flex-col justify-between space-y-3 p-4">
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h3 className="truncate font-display text-sm font-semibold text-ink">
                                  {formatEffectName(variant.effect)}
                                </h3>
                                <p className="truncate font-mono text-[11px] text-ink-subtle">
                                  {source.name} · {variant.variant_id}
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={() => setLightboxIdx(idx)}
                                className="rounded-lg border border-ink/10 p-1.5 text-ink-muted hover:bg-recessed hover:text-ink"
                                aria-label={`Inspect ${variant.variant_id} in lightbox`}
                              >
                                <Maximize2 className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                              <ClassChip label={source.label} size="xs" />
                              <AxisChip axis={variant.axis} size="xs" />
                            </div>

                            {paramEntries.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 pt-0.5">
                                {paramEntries.slice(0, 3).map(([k, v]) => (
                                  <span
                                    key={k}
                                    className="rounded bg-paper px-1.5 py-0.5 font-mono text-[10px] text-ink-muted"
                                  >
                                    {k}: {String(v)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="border-t border-ink/10 pt-3">
                            <button
                              type="button"
                              onClick={() => toggleFlagVariant(variant.variant_id)}
                              aria-pressed={isFlagged}
                              className={`inline-flex w-full items-center justify-center gap-2 rounded-control border px-3 py-1.5 text-xs font-medium transition-colors ${
                                isFlagged
                                  ? 'border-amberwarn-border bg-amberwarn-bg text-amberwarn-text'
                                  : 'border-ink/15 bg-paper text-ink-muted hover:border-alpine-300 hover:text-ink'
                              }`}
                            >
                              <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{isFlagged ? 'Flagged for review' : 'Flag for review'}</span>
                            </button>
                          </div>
                        </div>
                      </motion.article>
                    );
                  })}
                </div>
              </>
            ) : null}
          </motion.section>
        )}
      </AnimatePresence>

      {/* Lightbox with Prev/Next Stepping */}
      <Lightbox
        open={Boolean(activeLightboxCard)}
        onClose={() => setLightboxIdx(null)}
        title={
          activeLightboxCard
            ? `${formatEffectName(activeLightboxCard.variant.effect)} — ${activeLightboxCard.source.name}`
            : ''
        }
        subtitle={
          activeLightboxCard
            ? `${activeLightboxCard.variant.axis} · ${activeLightboxCard.variant.variant_id}`
            : ''
        }
        beforeSrc={activeLightboxCard?.beforeSrc}
        afterSrc={activeLightboxCard?.afterSrc}
        afterLabel={
          activeLightboxCard ? formatEffectName(activeLightboxCard.variant.effect) : 'Augmented'
        }
        currentIndex={lightboxIdx}
        totalCount={allVariantCards.length}
        onPrev={
          allVariantCards.length > 1
            ? () =>
                setLightboxIdx((i) => (i === null ? 0 : (i - 1 + allVariantCards.length) % allVariantCards.length))
            : null
        }
        onNext={
          allVariantCards.length > 1
            ? () => setLightboxIdx((i) => (i === null ? 0 : (i + 1) % allVariantCards.length))
            : null
        }
        footer={
          activeLightboxCard?.variant?.params &&
          Object.keys(activeLightboxCard.variant.params).length > 0 ? (
            <div className="flex flex-wrap gap-2 rounded-control bg-paper p-3">
              {Object.entries(activeLightboxCard.variant.params).map(([key, val]) => (
                <span
                  key={key}
                  className="rounded border border-ink/10 bg-surface px-2 py-1 font-mono text-xs text-ink"
                >
                  {key}: {String(val)}
                </span>
              ))}
            </div>
          ) : null
        }
      />
    </PageTransition>
  );
}