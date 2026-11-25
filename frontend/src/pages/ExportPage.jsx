import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Archive,
  ArrowRight,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  FileSpreadsheet,
  FolderTree,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { exportJob, getJob, listJobs } from '../api/client';
import { useAppData } from '../context/AppDataContext';
import { useToast } from '../context/ToastContext';
import { formatBytes, formatTimestamp } from '../utils/formatters';
import { PageTransition } from '../components/ui/PageTransition';
import { AlpineSelect } from '../components/ui/AlpineSelect';
import { AxisChip, ClassChip } from '../components/ui/ClassChip';
import { SkeletonBox } from '../components/ui/Skeleton';
import { StatePanel } from '../components/ui/StatePanel';

function stripExtension(name) {
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(0, idx) : name;
}

export function ExportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isMock } = useAppData();
  const { addToast } = useToast();

  const [jobsList, setJobsList] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState(null);

  const [selectedJobId, setSelectedJobId] = useState(() => searchParams.get('job') || '');
  const [jobDetail, setJobDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  const [includeOriginals, setIncludeOriginals] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(null); // { loaded, total, percent, indeterminate }
  const [lastDownload, setLastDownload] = useState(null);
  const [copiedCode, setCopiedCode] = useState(false);

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

  const loadJobDetail = useCallback(async (id) => {
    if (!id) {
      setJobDetail(null);
      return;
    }
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await getJob(id);
      setJobDetail(res);
    } catch (err) {
      setDetailError(err?.message || 'Unable to load job details.');
      setJobDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobDetail(selectedJobId);
    setLastDownload(null);
    setProgress(null);
  }, [selectedJobId, loadJobDetail]);

  const handleSelectJob = (nextId) => {
    setSelectedJobId(nextId);
    if (nextId) {
      setSearchParams({ job: nextId }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
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

  // Compute breakdowns, ZIP paths, and live 5-row manifest.csv preview
  const summary = useMemo(() => {
    const sources = jobDetail?.result?.sources || [];
    const classCounts = new Map();
    const axisCounts = new Map();
    const manifestRows = [];
    let totalVariants = 0;

    sources.forEach((src) => {
      const cls = src.label || 'unlabeled';
      const safeLabel = cls.replace(/[^a-zA-Z0-9_-]/g, '_');
      const base = stripExtension(src.name || src.source_id).replace(/[^a-zA-Z0-9_-]/g, '_');
      const vCount = (src.variants || []).length;
      totalVariants += vCount;
      classCounts.set(cls, (classCounts.get(cls) || 0) + vCount + (includeOriginals ? 1 : 0));

      if (includeOriginals && manifestRows.length < 5) {
        manifestRows.push({
          file: `${safeLabel}/${base}_original.jpg`,
          source_name: src.name,
          label: cls,
          axis: 'original',
          effect: 'none',
          params_json: '{}',
        });
      }

      (src.variants || []).forEach((v) => {
        if (v.axis) {
          axisCounts.set(v.axis, (axisCounts.get(v.axis) || 0) + 1);
        }
        if (manifestRows.length < 5) {
          manifestRows.push({
            file: `${safeLabel}/${base}_${v.variant_id}.jpg`,
            source_name: src.name,
            label: cls,
            axis: v.axis || '',
            effect: v.effect || '',
            params_json: JSON.stringify(v.params || {}),
          });
        }
      });
    });

    const totalImages = totalVariants + (includeOriginals ? sources.length : 0);
    const samplePaths = manifestRows.slice(0, 4).map((r) => r.file);

    return {
      sourceCount: sources.length,
      variantCount: totalVariants,
      totalImages,
      classCounts: Array.from(classCounts.entries()),
      axisCounts: Array.from(axisCounts.entries()),
      samplePaths,
      manifestPreview: manifestRows,
    };
  }, [jobDetail, includeOriginals]);

  const selectedJobMeta = useMemo(
    () => jobsList.find((j) => j.job_id === selectedJobId) || null,
    [jobsList, selectedJobId]
  );

  const expectedZipName = selectedJobId
    ? `sortaugment_${selectedJobId}${includeOriginals ? '_with_originals' : ''}.zip`
    : 'sortaugment_dataset.zip';

  const pytorchSnippet = useMemo(
    () => `import zipfile, pandas as pd
from torchvision import datasets, transforms

with zipfile.ZipFile("${expectedZipName}") as zf:
    zf.extractall("./dataset_${selectedJobId || 'job'}")

manifest = pd.read_csv("./dataset_${selectedJobId || 'job'}/manifest.csv")
train_ds = datasets.ImageFolder(
    "./dataset_${selectedJobId || 'job'}",
    transform=transforms.Compose([transforms.Resize((224, 224)), transforms.ToTensor()])
)
print(f"Loaded {len(train_ds)} images across classes: {train_ds.classes}")`,
    [expectedZipName, selectedJobId]
  );

  const handleCopySnippet = async () => {
    try {
      await navigator.clipboard.writeText(pytorchSnippet);
      setCopiedCode(true);
      addToast({ title: 'PyTorch loader snippet copied', tone: 'success' });
      window.setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      addToast({ title: 'Clipboard access blocked by browser', tone: 'warning' });
    }
  };

  const handleDownload = async () => {
    if (!selectedJobId || downloading) return;
    setDownloading(true);
    setProgress({ loaded: 0, total: null, percent: null, indeterminate: true });
    setLastDownload(null);

    try {
      const { blob, filename } = await exportJob(selectedJobId, {
        includeOriginals,
        onProgress: (p) => setProgress(p),
      });

      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);

      setLastDownload({ filename, size: blob.size });
      addToast({
        title: 'Training archive downloaded',
        description: `${filename} (${formatBytes(blob.size)})`,
        tone: 'success',
      });
    } catch (err) {
      addToast({
        title: 'Export failed',
        description: err?.message || 'Unable to package or download ZIP archive.',
        tone: 'error',
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <PageTransition className="space-y-6">
      {/* Job Picker Bar (z-20 ensures AlpineSelect popover floats cleanly above cards below) */}
      <section className="sa-card relative z-20 flex flex-col gap-4 p-5 md:flex-row md:items-end md:justify-between">
        <div className="w-full max-w-lg space-y-1.5">
          <span
            id="export-job-label"
            className="block text-xs font-semibold uppercase tracking-wider text-ink-subtle"
          >
            Select Completed Job to Package
          </span>
          {jobsLoading ? (
            <SkeletonBox className="h-11 w-full" />
          ) : (
            <AlpineSelect
              id="export-job-select"
              labelId="export-job-label"
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
            onClick={loadJobs}
            disabled={jobsLoading}
            className="sa-btn-secondary"
          >
            <RefreshCw className={`h-4 w-4 ${jobsLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh jobs
          </button>
          {selectedJobId && (
            <Link
              to={`/classify?job=${encodeURIComponent(selectedJobId)}`}
              className="sa-btn-secondary border-alpine-200 bg-alpine-50 text-alpine-800 hover:bg-alpine-100"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Check classifier
            </Link>
          )}
        </div>
      </section>

      {/* States */}
      {jobsError ? (
        <StatePanel
          variant="error"
          title="Could not load jobs"
          description={jobsError}
          actionLabel="Retry"
          onAction={loadJobs}
        />
      ) : !jobsLoading && jobsList.length === 0 ? (
        <StatePanel
          icon={Archive}
          title="Nothing ready to export yet"
          description="Complete an augmentation or live generation job first to bundle your labeled dataset and manifest.csv."
          secondaryAction={
            <Link to="/augment" className="sa-btn-primary">
              Open Augment Studio
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          }
        />
      ) : detailLoading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <SkeletonBox className="h-72 w-full" />
          <SkeletonBox className="h-72 w-full" />
        </div>
      ) : detailError ? (
        <StatePanel
          variant="error"
          title="Could not load job summary"
          description={detailError}
          actionLabel="Retry"
          onAction={() => loadJobDetail(selectedJobId)}
        />
      ) : jobDetail ? (
        <>
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            {/* Left: Job Summary & Breakdown */}
            <section className="sa-card space-y-6 p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-xl font-semibold text-ink">Job Summary</h2>
                    <span className="rounded-full border border-alpine-200 bg-alpine-50 px-2.5 py-0.5 font-mono text-xs font-medium text-alpine-800">
                      {jobDetail.job_id}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-ink-subtle">
                    type: {jobDetail.type}
                    {selectedJobMeta?.created_at
                      ? ` · created ${formatTimestamp(selectedJobMeta.created_at)}`
                      : ''}
                    {' · exports full job archive'}
                  </p>
                </div>
              </div>

              {/* Key Count Tiles */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-control border border-ink/10 bg-paper/85 p-3.5">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-ink-subtle">
                    Sources
                  </span>
                  <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-ink">
                    {summary.sourceCount}
                  </p>
                </div>
                <div className="rounded-control border border-ink/10 bg-paper/85 p-3.5">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-ink-subtle">
                    Variants
                  </span>
                  <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-ink">
                    {summary.variantCount}
                  </p>
                </div>
                <div className="rounded-control border border-alpine-200 bg-alpine-50/80 p-3.5">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-alpine-700">
                    Total in ZIP
                  </span>
                  <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-alpine-800">
                    {summary.totalImages}
                  </p>
                </div>
              </div>

              {/* Class Distribution */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                  Folder Distribution by Class
                </h3>
                <div className="flex flex-wrap gap-2">
                  {summary.classCounts.map(([cls, count]) => (
                    <div
                      key={cls}
                      className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-paper/85 py-1 pl-1.5 pr-3"
                    >
                      <ClassChip label={cls} size="xs" />
                      <span className="font-mono text-xs font-semibold tabular-nums text-ink">
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Axis Distribution */}
              {summary.axisCounts.length > 0 && (
                <div className="space-y-2.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                    Variants by Stress Axis
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {summary.axisCounts.map(([axis, count]) => (
                      <div
                        key={axis}
                        className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-paper/85 py-1 pl-1.5 pr-3"
                      >
                        <AxisChip axis={axis} size="xs" />
                        <span className="font-mono text-xs font-semibold tabular-nums text-ink">
                          {count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Archive Layout Preview */}
              <div className="rounded-control border border-ink/10 bg-paper/85 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-ink">
                  <FolderTree className="h-4 w-4 text-alpine-700" aria-hidden="true" />
                  <span>ZIP Archive Structure</span>
                </div>
                <pre className="mt-2.5 overflow-x-auto font-mono text-[11px] leading-relaxed text-ink-muted">
                  {`${expectedZipName}\n`}
                  {summary.samplePaths.map((p) => `├── ${p}\n`).join('')}
                  {summary.totalImages > summary.samplePaths.length
                    ? `├── … (${summary.totalImages - summary.samplePaths.length} more images)\n`
                    : ''}
                  {`└── manifest.csv`}
                </pre>
              </div>
            </section>

            {/* Right: Export Options & Download Progress */}
            <section className="sa-card flex flex-col justify-between space-y-6 p-5 md:p-6">
              <div className="space-y-5">
                <div>
                  <h2 className="font-display text-xl font-semibold text-ink">
                    Package & Download
                  </h2>
                  <p className="mt-1 text-sm text-ink-muted">
                    Packages every image in this job ready for PyTorch{' '}
                    <code className="font-mono text-xs">ImageFolder</code> or TensorFlow{' '}
                    <code className="font-mono text-xs">image_dataset_from_directory</code>.
                  </p>
                </div>

                {/* Include Originals Toggle Switch */}
                <div className="flex items-start justify-between gap-4 rounded-control border border-ink/10 bg-paper/85 p-4">
                  <div>
                    <span
                      id="include-originals-label"
                      className="block text-sm font-semibold text-ink"
                    >
                      Include original images
                    </span>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                      Bundle the {summary.sourceCount} unaugmented source photo
                      {summary.sourceCount === 1 ? '' : 's'} alongside the {summary.variantCount}{' '}
                      generated variant{summary.variantCount === 1 ? '' : 's'} inside their class
                      folders.
                    </p>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={includeOriginals}
                    aria-labelledby="include-originals-label"
                    disabled={downloading}
                    onClick={() => setIncludeOriginals((v) => !v)}
                    className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors ${
                      includeOriginals
                        ? 'border-alpine-600 bg-alpine-600'
                        : 'border-ink/20 bg-recessed'
                    } disabled:opacity-50`}
                  >
                    <motion.span
                      layout
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                      className={`inline-block h-4 w-4 rounded-full bg-surface shadow-sm ${
                        includeOriginals ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {isMock && (
                  <p className="rounded-control border border-amberwarn-border bg-amberwarn-bg/95 px-3.5 py-2.5 text-xs text-amberwarn-text">
                    Demo mode packages a real ZIP directly in your browser using JSZip with your
                    canvas-augmented images and a contract-compliant{' '}
                    <code className="font-mono">manifest.csv</code>.
                  </p>
                )}

                {/* Download Progress Area */}
                {downloading && progress && (
                  <div
                    className="space-y-2 rounded-control border border-alpine-200 bg-alpine-50/70 p-4"
                    role="status"
                    aria-live="polite"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-alpine-800">
                        {progress.indeterminate
                          ? 'Downloading ZIP archive…'
                          : 'Preparing & downloading ZIP…'}
                      </span>
                      <span className="font-mono font-semibold tabular-nums text-alpine-800">
                        {progress.indeterminate
                          ? progress.loaded > 0
                            ? formatBytes(progress.loaded)
                            : 'Streaming…'
                          : `${progress.percent}%`}
                      </span>
                    </div>

                    <div className="h-2 w-full overflow-hidden rounded-full bg-alpine-100">
                      {progress.indeterminate ? (
                        <div className="sa-indeterminate-bar h-full w-full rounded-full bg-gradient-to-r from-alpine-500 to-alpine-600" />
                      ) : (
                        <motion.div
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: (progress.percent || 0) / 100 }}
                          transition={{ duration: 0.15 }}
                          style={{ transformOrigin: 'left center' }}
                          className="h-full w-full rounded-full bg-gradient-to-r from-alpine-500 to-alpine-600"
                        />
                      )}
                    </div>

                    {!progress.indeterminate && progress.total && progress.total > 100 && (
                      <p className="font-mono text-[11px] text-alpine-700">
                        {formatBytes(progress.loaded)} / {formatBytes(progress.total)}
                      </p>
                    )}
                  </div>
                )}

                {/* Completed Download Confirmation */}
                {!downloading && lastDownload && (
                  <div className="flex items-center gap-3 rounded-control border border-emeraldok-border bg-emeraldok-bg p-3.5 text-xs text-emeraldok-text">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emeraldok-accent" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{lastDownload.filename}</p>
                      <p className="font-mono text-[11px] opacity-90">
                        Saved · {formatBytes(lastDownload.size)}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-ink/10 pt-5">
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading || !selectedJobId}
                  className="sa-btn-primary w-full py-3"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {downloading
                    ? 'Downloading training set…'
                    : `Download ZIP (${summary.totalImages} image${
                        summary.totalImages === 1 ? '' : 's'
                      } + manifest.csv)`}
                </button>
              </div>
            </section>
          </div>

          {/* Live manifest.csv Preview Table + PyTorch Loader Snippet */}
          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            {/* Manifest Preview */}
            <section className="sa-card overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-ink/10 px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-alpine-700" aria-hidden="true" />
                  <h3 className="font-display text-sm font-semibold text-ink">
                    manifest.csv Preview (first {summary.manifestPreview.length} rows)
                  </h3>
                </div>
                <span className="font-mono text-[11px] text-ink-subtle">
                  {summary.totalImages} total rows
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] border-collapse text-left font-mono text-[11px]">
                  <thead>
                    <tr className="border-b border-ink/10 bg-paper/85 text-ink-subtle">
                      <th className="px-4 py-2 font-semibold">file</th>
                      <th className="px-3 py-2 font-semibold">label</th>
                      <th className="px-3 py-2 font-semibold">axis</th>
                      <th className="px-3 py-2 font-semibold">effect</th>
                      <th className="px-4 py-2 font-semibold">params_json</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10 text-ink">
                    {summary.manifestPreview.map((row) => (
                      <tr key={row.file} className="hover:bg-alpine-50/35">
                        <td className="max-w-[200px] truncate px-4 py-2" title={row.file}>
                          {row.file}
                        </td>
                        <td className="px-3 py-2">{row.label}</td>
                        <td className="px-3 py-2 text-ink-muted">{row.axis}</td>
                        <td className="px-3 py-2 text-ink-muted">{row.effect}</td>
                        <td
                          className="max-w-[180px] truncate px-4 py-2 text-ink-subtle"
                          title={row.params_json}
                        >
                          {row.params_json}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* PyTorch Training Snippet */}
            <section className="sa-card flex flex-col justify-between overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-ink/10 px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-alpine-700" aria-hidden="true" />
                  <h3 className="font-display text-sm font-semibold text-ink">
                    PyTorch Quick-Load Snippet
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={handleCopySnippet}
                  className="sa-btn-secondary px-2.5 py-1 text-xs"
                >
                  {copiedCode ? (
                    <Check className="h-3.5 w-3.5 text-emeraldok-accent" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {copiedCode ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="overflow-x-auto bg-paper/80 p-4 font-mono text-[11px] leading-relaxed text-ink">
                <code>{pytorchSnippet}</code>
              </pre>
            </section>
          </div>
        </>
      ) : null}
    </PageTransition>
  );
}