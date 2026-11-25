import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  Flag,
  Info,
  Maximize2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { classifyJob, getJob, listJobs, resolveFileUrl } from '../api/client';
import { useAppData } from '../context/AppDataContext';
import { useToast } from '../context/ToastContext';
import { getAxisStyle } from '../utils/classColors';
import {
  formatClassLabel,
  formatEffectName,
  formatPercent,
  formatTimestamp,
} from '../utils/formatters';
import { PageTransition } from '../components/ui/PageTransition';
import { AlpineSelect } from '../components/ui/AlpineSelect';
import { AxisChip, ClassChip } from '../components/ui/ClassChip';
import { ConfidenceBar } from '../components/ui/ConfidenceBar';
import { TiltCard } from '../components/ui/TiltCard';
import { Lightbox } from '../components/ui/Lightbox';
import { SkeletonBox, SkeletonCardGrid } from '../components/ui/Skeleton';
import { StatePanel } from '../components/ui/StatePanel';

export function ClassifierCheckPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { classes, isMock } = useAppData();
  const { addToast } = useToast();

  const [jobsList, setJobsList] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState(null);

  const [selectedJobId, setSelectedJobId] = useState(() => searchParams.get('job') || '');
  const [jobDetail, setJobDetail] = useState(null);
  const [classification, setClassification] = useState(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState(null);

  // Filter modes: 'all' | 'changed' | 'flagged'
  const [filterMode, setFilterMode] = useState('all');
  const [expandedProbs, setExpandedProbs] = useState(() => new Set());
  const [lightboxIdx, setLightboxIdx] = useState(null);

  // Variant IDs flagged for review in Augment Studio Step 3
  const flaggedSet = useMemo(() => {
    const raw = searchParams.get('flagged') || '';
    return new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );
  }, [searchParams]);

  const loadJobs = useCallback(async () => {
    setJobsLoading(true);
    setJobsError(null);
    try {
      const data = await listJobs();
      const doneJobs = (data?.jobs || []).filter((j) => j.status === 'done');
      setJobsList(doneJobs);

      const paramJob = searchParams.get('job');
      if (paramJob && doneJobs.some((j) => j.job_id === paramJob)) {
        setSelectedJobId(paramJob);
      } else if (doneJobs.length > 0) {
        setSelectedJobId((prev) =>
          prev && doneJobs.some((j) => j.job_id === prev) ? prev : doneJobs[0].job_id
        );
      } else {
        setSelectedJobId('');
      }
    } catch (err) {
      setJobsError(err?.message || 'Unable to fetch completed jobs.');
    } finally {
      setJobsLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const runClassification = useCallback(
    async (targetJobId) => {
      if (!targetJobId) return;
      setChecking(true);
      setCheckError(null);
      setLightboxIdx(null);
      try {
        const [jobRes, clsRes] = await Promise.all([getJob(targetJobId), classifyJob(targetJobId)]);
        setJobDetail(jobRes);
        setClassification(clsRes);
      } catch (err) {
        const msg = err?.message || 'Classifier evaluation failed.';
        setCheckError(msg);
        setClassification(null);
        addToast({ title: 'Classifier check failed', description: msg, tone: 'error' });
      } finally {
        setChecking(false);
      }
    },
    [addToast]
  );

  useEffect(() => {
    if (selectedJobId) {
      runClassification(selectedJobId);
    } else {
      setJobDetail(null);
      setClassification(null);
    }
  }, [selectedJobId, runClassification]);

  const handleSelectJob = (nextId) => {
    setSelectedJobId(nextId);
    setFilterMode('all');
    if (nextId) {
      setSearchParams({ job: nextId }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  const toggleProbs = (sourceId) => {
    setExpandedProbs((prev) => {
      const next = new Set(prev);
      if (next.has(sourceId)) next.delete(sourceId);
      else next.add(sourceId);
      return next;
    });
  };

  const jobOptions = useMemo(
    () =>
      jobsList.map((j) => ({
        value: j.job_id,
        label: j.job_id,
        badge: j.type,
        meta: `${j.n_sources} src · ${j.n_variants} var · ${formatTimestamp(j.created_at)}`,
      })),
    [jobsList]
  );

  // Merge job source/variant visuals with predictions
  const mergedItems = useMemo(() => {
    if (!classification?.items) return [];
    const sourceLookup = new Map();
    (jobDetail?.result?.sources || []).forEach((src) => {
      sourceLookup.set(src.source_id, src);
    });

    return classification.items.map((item) => {
      const srcMeta = sourceLookup.get(item.source_id);
      const variantLookup = new Map();
      (srcMeta?.variants || []).forEach((v) => variantLookup.set(v.variant_id, v));

      const variants = (item.variants || []).map((vPred) => {
        const vMeta = variantLookup.get(vPred.variant_id);
        return {
          ...vPred,
          url: vMeta?.url || '',
          axis: vMeta?.axis || '',
          effect: vMeta?.effect || '',
          mode: vMeta?.mode || null,
          params: vMeta?.params || {},
          isFlagged: flaggedSet.has(vPred.variant_id),
        };
      });

      const filteredVariants =
        filterMode === 'changed'
          ? variants.filter((v) => v.changed)
          : filterMode === 'flagged'
            ? variants.filter((v) => v.isFlagged)
            : variants;

      return {
        source_id: item.source_id,
        name: srcMeta?.name || item.source_id,
        assignedLabel: srcMeta?.label || 'unlabeled',
        url: srcMeta?.url || '',
        original: item.original,
        variants,
        filteredVariants,
      };
    });
  }, [classification, jobDetail, filterMode, flaggedSet]);

  // Compute Flip-Rate by Stress Axis + Top Confusion Pairs
  const diagnostics = useMemo(() => {
    const axisMap = new Map();
    const pairMap = new Map();
    let matchedFlaggedCount = 0;

    mergedItems.forEach((item) => {
      const origLabel = item.original?.label || 'unknown';
      item.variants.forEach((v) => {
        if (v.isFlagged) matchedFlaggedCount += 1;

        if (v.axis) {
          const entry = axisMap.get(v.axis) || { axis: v.axis, total: 0, flipped: 0 };
          entry.total += 1;
          if (v.changed) entry.flipped += 1;
          axisMap.set(v.axis, entry);
        }

        if (v.changed && v.label && v.label !== origLabel) {
          const key = `${origLabel}::${v.label}`;
          const existing = pairMap.get(key) || { from: origLabel, to: v.label, count: 0 };
          existing.count += 1;
          pairMap.set(key, existing);
        }
      });
    });

    const axisBreakdown = Array.from(axisMap.values())
      .map((a) => ({ ...a, rate: a.total > 0 ? a.flipped / a.total : 0 }))
      .sort((a, b) => b.rate - a.rate);

    const topConfusions = Array.from(pairMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return { axisBreakdown, topConfusions, matchedFlaggedCount };
  }, [mergedItems]);

  // Flat list of visible variants for Lightbox Prev/Next stepping
  const lightboxEntries = useMemo(() => {
    const list = [];
    mergedItems.forEach((item) => {
      const origSrc = resolveFileUrl(item.url);
      item.filteredVariants.forEach((variant) => {
        const varSrc = resolveFileUrl(variant.url);
        if (origSrc && varSrc) {
          list.push({
            variantId: variant.variant_id,
            title: `${item.name} — ${formatEffectName(variant.effect) || variant.variant_id}`,
            subtitle: `Original: ${item.original?.label} (${formatPercent(
              item.original?.confidence
            )}) → Variant: ${variant.label} (${formatPercent(variant.confidence)})`,
            beforeSrc: origSrc,
            afterSrc: varSrc,
            afterLabel: formatEffectName(variant.effect) || 'Variant',
          });
        }
      });
    });
    return list;
  }, [mergedItems]);

  const activeLightbox =
    lightboxIdx !== null && lightboxEntries[lightboxIdx] ? lightboxEntries[lightboxIdx] : null;

  const totalVariants = classification?.summary?.total_variants ?? 0;
  const changedCount = classification?.summary?.prediction_changed ?? 0;
  const flipRate = totalVariants > 0 ? changedCount / totalVariants : 0;

  return (
    <PageTransition className="space-y-6">
      {/* Required Demo Model Banner */}
      <div
        role="note"
        className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-amberwarn-border bg-amberwarn-bg/95 px-4 py-3 text-sm text-amberwarn-text shadow-sm backdrop-blur-sm"
      >
        <div className="flex items-center gap-2.5">
          <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="font-medium">Demo model: 6 classes only.</span>
          <span className="hidden text-xs opacity-90 sm:inline">
            {isMock
              ? 'Predictions below are simulated for offline demo evaluation.'
              : 'Classifier predictions reflect the loaded 6-class demonstration checkpoint.'}
          </span>
        </div>
        {classification?.model && (
          <span className="rounded-full border border-amberwarn-border bg-surface/90 px-2.5 py-0.5 font-mono text-[11px] font-medium text-ink">
            {classification.model}
          </span>
        )}
      </div>

      {/* Job Selector & Controls (z-20 ensures AlpineSelect popover floats cleanly above cards below) */}
      <section className="sa-card relative z-20 flex flex-col gap-4 p-5 md:flex-row md:items-end md:justify-between">
        <div className="w-full max-w-lg space-y-1.5">
          <span
            id="classify-job-label"
            className="block text-xs font-semibold uppercase tracking-wider text-ink-subtle"
          >
            Completed Job to Audit
          </span>
          {jobsLoading ? (
            <SkeletonBox className="h-11 w-full" />
          ) : (
            <AlpineSelect
              id="classify-job-select"
              labelId="classify-job-label"
              value={selectedJobId}
              onChange={handleSelectJob}
              options={jobOptions}
              emptyLabel="No completed jobs available"
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={!selectedJobId || checking}
            onClick={() => runClassification(selectedJobId)}
            className="sa-btn-secondary"
          >
            <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} aria-hidden="true" />
            Re-run check
          </button>

          {selectedJobId && (
            <Link
              to={`/export?job=${encodeURIComponent(selectedJobId)}`}
              className="sa-btn-primary"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Export job
            </Link>
          )}
        </div>
      </section>

      {/* Error or Empty States */}
      {jobsError ? (
        <StatePanel
          variant="error"
          title="Unable to load jobs list"
          description={jobsError}
          actionLabel="Retry"
          onAction={loadJobs}
        />
      ) : !jobsLoading && jobsList.length === 0 ? (
        <StatePanel
          title="No completed augmentation jobs yet"
          description="Run a batch in Augment Studio or Live Generate first, then return here to audit how the classifier reacts to each variation."
          secondaryAction={
            <Link to="/augment" className="sa-btn-primary">
              Go to Augment Studio
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          }
        />
      ) : checking ? (
        <div className="space-y-4">
          <SkeletonBox className="h-24 w-full" />
          <SkeletonCardGrid count={3} columnsClass="grid-cols-1 md:grid-cols-3" />
        </div>
      ) : checkError ? (
        <StatePanel
          variant="error"
          title="Classifier check failed"
          description={checkError}
          actionLabel="Try again"
          onAction={() => runClassification(selectedJobId)}
        />
      ) : classification ? (
        <>
          {/* Summary Strip */}
          <section className="sa-card flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-card border ${
                  changedCount > 0
                    ? 'border-amberwarn-border bg-amberwarn-bg text-amberwarn-text'
                    : 'border-emeraldok-border bg-emeraldok-bg text-emeraldok-text'
                }`}
              >
                {changedCount > 0 ? (
                  <ShieldAlert className="h-6 w-6" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="h-6 w-6" aria-hidden="true" />
                )}
              </div>
              <div>
                <h2 className="font-display text-xl font-bold text-ink">
                  {changedCount} of {totalVariants} variants changed prediction
                </h2>
                <p className="mt-1 text-sm text-ink-muted">
                  Prediction flip rate:{' '}
                  <span className="font-mono font-semibold text-ink">
                    {formatPercent(flipRate, 1)}
                  </span>{' '}
                  across {mergedItems.length} source image{mergedItems.length === 1 ? '' : 's'}.
                </p>
              </div>
            </div>

            {/* Filter pills */}
            <div className="flex flex-wrap items-center gap-2 self-start lg:self-center">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  filterMode === 'all'
                    ? 'border-alpine-600 bg-alpine-600 text-surface shadow-sm'
                    : 'border-ink/15 bg-paper text-ink-muted hover:border-alpine-300 hover:text-ink'
                }`}
              >
                All ({totalVariants})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('changed')}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  filterMode === 'changed'
                    ? 'border-amberwarn-accent bg-amberwarn-bg text-amberwarn-text shadow-sm'
                    : 'border-ink/15 bg-paper text-ink-muted hover:border-amberwarn-border hover:text-ink'
                }`}
              >
                Changed only ({changedCount})
              </button>
              {diagnostics.matchedFlaggedCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFilterMode('flagged')}
                  className={`inline-flex items-center gap-1 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                    filterMode === 'flagged'
                      ? 'border-alpine-600 bg-alpine-50 text-alpine-800 shadow-sm'
                      : 'border-ink/15 bg-paper text-ink-muted hover:border-alpine-300 hover:text-ink'
                  }`}
                >
                  <Flag className="h-3 w-3" aria-hidden="true" />
                  Flagged ({diagnostics.matchedFlaggedCount})
                </button>
              )}
            </div>
          </section>

          {/* Diagnostic Breakdown: Flip-Rate by Axis + Top Confusion Pairs */}
          {(diagnostics.axisBreakdown.length > 0 || diagnostics.topConfusions.length > 0) && (
            <section className="grid gap-4 lg:grid-cols-2">
              <div className="sa-card space-y-3 p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-sm font-semibold text-ink">
                    Vulnerability by Stress Axis
                  </h3>
                  <span className="font-mono text-[11px] text-ink-subtle">
                    Higher = prioritize in training
                  </span>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-3">
                  {diagnostics.axisBreakdown.map((ax) => {
                    const style = getAxisStyle(ax.axis);
                    return (
                      <div
                        key={ax.axis}
                        style={{ borderColor: style.border, backgroundColor: `${style.bg}99` }}
                        className="rounded-control border p-3"
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: style.dot }}
                            aria-hidden="true"
                          />
                          <span className="truncate text-xs font-semibold text-ink">
                            {style.label}
                          </span>
                        </div>
                        <p className="mt-2 font-mono text-xl font-bold tabular-nums text-ink">
                          {formatPercent(ax.rate, 0)}
                        </p>
                        <p className="font-mono text-[10px] text-ink-muted">
                          {ax.flipped}/{ax.total} flipped
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="sa-card space-y-3 p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-sm font-semibold text-ink">
                    Top Confusion Pairs
                  </h3>
                  <span className="font-mono text-[11px] text-ink-subtle">
                    Original → Misclassified as
                  </span>
                </div>
                {diagnostics.topConfusions.length === 0 ? (
                  <p className="rounded-control border border-emeraldok-border bg-emeraldok-bg px-3.5 py-3 text-xs text-emeraldok-text">
                    Zero prediction confusions detected across this job.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {diagnostics.topConfusions.map((pair) => (
                      <div
                        key={`${pair.from}-${pair.to}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-ink/12 bg-paper px-2.5 py-1.5 text-xs"
                      >
                        <ClassChip label={pair.from} size="xs" />
                        <ArrowRight className="h-3 w-3 text-ink-subtle" aria-hidden="true" />
                        <ClassChip label={pair.to} size="xs" />
                        <span className="ml-0.5 rounded bg-amberwarn-bg px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amberwarn-text">
                          ×{pair.count}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Source-by-Source Comparison */}
          <div className="space-y-6">
            {mergedItems.map((item) => {
              const origSrc = resolveFileUrl(item.url);
              const showProbs = expandedProbs.has(item.source_id);
              const probEntries = Object.entries(item.original?.probs || {}).sort(
                (a, b) => Number(b[1]) - Number(a[1])
              );
              const orderedProbClasses =
                classes.length > 0 ? classes : probEntries.map(([cls]) => cls);

              return (
                <section key={item.source_id} className="sa-card overflow-hidden">
                  {/* Original Baseline Header */}
                  <div className="grid gap-5 border-b border-ink/10 bg-paper/65 p-5 lg:grid-cols-[260px_1fr]">
                    <div className="flex items-center gap-3.5">
                      {origSrc ? (
                        <img
                          src={origSrc}
                          alt={`Original ${item.name}`}
                          className="h-20 w-24 shrink-0 rounded-control border border-ink/10 object-cover shadow-sm"
                        />
                      ) : (
                        <div className="h-20 w-24 shrink-0 rounded-control bg-recessed" />
                      )}
                      <div className="min-w-0 space-y-1.5">
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                          Original Photo
                        </span>
                        <h3
                          className="truncate font-display text-base font-semibold text-ink"
                          title={item.name}
                        >
                          {item.name}
                        </h3>
                        <p className="font-mono text-[11px] text-ink-subtle">
                          Ground tag: {formatClassLabel(item.assignedLabel)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col justify-center space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium text-ink-muted">
                            Baseline prediction:
                          </span>
                          <ClassChip label={item.original?.label} />
                        </div>
                        {probEntries.length > 0 && (
                          <button
                            type="button"
                            onClick={() => toggleProbs(item.source_id)}
                            className="font-mono text-xs font-medium text-alpine-700 hover:underline"
                          >
                            {showProbs ? 'Hide class probabilities' : 'Show class probabilities'}
                          </button>
                        )}
                      </div>

                      <ConfidenceBar
                        value={item.original?.confidence}
                        tone="alpine"
                        label="Original confidence"
                      />

                      {showProbs && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="grid gap-2 rounded-control border border-ink/10 bg-surface/90 p-3 sm:grid-cols-2 lg:grid-cols-3"
                        >
                          {orderedProbClasses.map((clsName) => (
                            <ConfidenceBar
                              key={clsName}
                              value={item.original?.probs?.[clsName] ?? 0}
                              tone={clsName === item.original?.label ? 'alpine' : 'neutral'}
                              label={formatClassLabel(clsName)}
                              compact
                            />
                          ))}
                        </motion.div>
                      )}
                    </div>
                  </div>

                  {/* 3D Tilt Variant Audit Cards */}
                  <div className="p-5">
                    {item.filteredVariants.length === 0 ? (
                      <p className="py-4 text-center text-sm text-ink-muted">
                        {filterMode === 'flagged'
                          ? 'No variants from this source were flagged for review.'
                          : `No prediction flips for this source image — classifier remained stable across all ${
                              item.variants.length
                            } variant${item.variants.length === 1 ? '' : 's'}.`}
                      </p>
                    ) : (
                      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                        {item.filteredVariants.map((variant) => {
                          const varSrc = resolveFileUrl(variant.url);
                          const delta =
                            Number(variant.confidence || 0) -
                            Number(item.original?.confidence || 0);
                          const lbIndex = lightboxEntries.findIndex(
                            (e) => e.variantId === variant.variant_id
                          );

                          return (
                            <TiltCard
                              key={variant.variant_id}
                              maxTilt={5}
                              className={`p-4 ${
                                variant.changed
                                  ? 'border-amberwarn-border bg-amberwarn-bg/45'
                                  : variant.isFlagged
                                    ? 'border-alpine-300 ring-1 ring-alpine-500/25'
                                    : ''
                              }`}
                            >
                              <div className="flex h-full flex-col justify-between">
                                <div className="space-y-3">
                                  <div className="relative overflow-hidden rounded-control border border-ink/10 bg-recessed">
                                    {varSrc ? (
                                      <img
                                        src={varSrc}
                                        alt={`${item.name} ${variant.effect}`}
                                        className="aspect-[4/3] w-full object-cover"
                                      />
                                    ) : (
                                      <div className="aspect-[4/3] w-full bg-recessed" />
                                    )}

                                    {/* Flip / Stable badge */}
                                    <span
                                      className={`absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold shadow-sm ${
                                        variant.changed
                                          ? 'bg-amberwarn-accent text-ink'
                                          : 'bg-emeraldok-accent text-surface'
                                      }`}
                                    >
                                      {variant.changed ? (
                                        <>
                                          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                                          PREDICTION CHANGED
                                        </>
                                      ) : (
                                        <>
                                          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                                          STABLE
                                        </>
                                      )}
                                    </span>

                                    {variant.isFlagged && (
                                      <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-alpine-200 bg-surface/95 px-2 py-0.5 font-mono text-[10px] font-semibold text-alpine-800 shadow-sm">
                                        <Flag className="h-2.5 w-2.5 text-alpine-600" aria-hidden="true" />
                                        FLAGGED
                                      </span>
                                    )}

                                    {lbIndex >= 0 && (
                                      <button
                                        type="button"
                                        onClick={() => setLightboxIdx(lbIndex)}
                                        className="absolute bottom-2 right-2 rounded-lg border border-ink/15 bg-surface/90 p-1.5 text-ink shadow-sm backdrop-blur-sm hover:bg-surface"
                                        aria-label={`Compare ${variant.variant_id} with original`}
                                      >
                                        <Maximize2 className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </div>

                                  <div className="space-y-1.5">
                                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                                      <span className="font-display text-sm font-semibold text-ink">
                                        {formatEffectName(variant.effect) || variant.variant_id}
                                      </span>
                                      {variant.axis && <AxisChip axis={variant.axis} size="xs" />}
                                    </div>

                                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                      <ClassChip label={variant.label} size="xs" />
                                      {variant.changed && (
                                        <span className="font-mono text-[11px] font-medium text-amberwarn-text">
                                          was {formatClassLabel(item.original?.label)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-3.5 border-t border-ink/10 pt-3">
                                  <ConfidenceBar
                                    value={variant.confidence}
                                    tone={variant.changed ? 'warning' : 'alpine'}
                                    label={`Confidence (${delta >= 0 ? '+' : ''}${(
                                      delta * 100
                                    ).toFixed(1)}%)`}
                                  />
                                </div>
                              </div>
                            </TiltCard>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      ) : null}

      {/* Lightbox with Prev/Next Stepping */}
      <Lightbox
        open={Boolean(activeLightbox)}
        onClose={() => setLightboxIdx(null)}
        title={activeLightbox?.title}
        subtitle={activeLightbox?.subtitle}
        beforeSrc={activeLightbox?.beforeSrc}
        afterSrc={activeLightbox?.afterSrc}
        afterLabel={activeLightbox?.afterLabel}
        currentIndex={lightboxIdx}
        totalCount={lightboxEntries.length}
        onPrev={
          lightboxEntries.length > 1
            ? () =>
                setLightboxIdx((i) =>
                  i === null ? 0 : (i - 1 + lightboxEntries.length) % lightboxEntries.length
                )
            : null
        }
        onNext={
          lightboxEntries.length > 1
            ? () => setLightboxIdx((i) => (i === null ? 0 : (i + 1) % lightboxEntries.length))
            : null
        }
      />
    </PageTransition>
  );
}