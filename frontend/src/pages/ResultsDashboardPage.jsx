import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ErrorBar,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BarChart3,
  BookOpen,
  Check,
  Copy,
  Download,
  FlaskConical,
  Image as ImageIcon,
  Maximize2,
  RefreshCw,
} from 'lucide-react';
import { getResults, resolveFileUrl } from '../api/client';
import { useAppData } from '../context/AppDataContext';
import { useToast } from '../context/ToastContext';
import { formatPercent } from '../utils/formatters';
import { PageTransition } from '../components/ui/PageTransition';
import { DemoBadge } from '../components/ui/DemoBadge';
import { TiltCard } from '../components/ui/TiltCard';
import { Lightbox } from '../components/ui/Lightbox';
import { SkeletonBox } from '../components/ui/Skeleton';
import { StatePanel } from '../components/ui/StatePanel';

function toPct(val) {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return null;
  return +(Number(val) * 100).toFixed(1);
}

function formatPctDisplay(val) {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return 'n/a';
  return `${Number(val).toFixed(1)}%`;
}

function DeltaPill({ current, baseline }) {
  if (
    current === null ||
    current === undefined ||
    baseline === null ||
    baseline === undefined
  ) {
    return null;
  }
  const diffPp = (Number(current) - Number(baseline)) * 100;
  if (Math.abs(diffPp) < 0.05) return null;
  const positive = diffPp > 0;
  return (
    <span
      className={`ml-1.5 inline-flex rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums ${
        positive
          ? 'bg-emeraldok-bg text-emeraldok-text'
          : 'bg-err-bg text-err-text'
      }`}
    >
      {positive ? '+' : ''}
      {diffPp.toFixed(1)} pp
    </span>
  );
}

function escapeCsv(val) {
  const str = val === null || val === undefined ? 'n/a' : String(val);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function ScrollChartCard({ title, subtitle, badge = null, children }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: 12 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="sa-card p-5 md:p-6"
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>}
        </div>
        {badge}
      </div>

      <div className="h-[320px] w-full">
        {inView ? children : <SkeletonBox className="h-full w-full" />}
      </div>
    </motion.section>
  );
}

function BenchmarkTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0]?.payload;

  return (
    <div className="rounded-control border border-alpine-200/90 bg-surface/95 p-3 text-xs shadow-popover backdrop-blur-md">
      <p className="font-display text-sm font-semibold text-ink">{label}</p>
      <div className="mt-2 space-y-1.5 font-mono">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-ink-muted">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: entry.color }}
                aria-hidden="true"
              />
              {entry.name}
            </span>
            <span className="font-semibold tabular-nums text-ink">
              {formatPctDisplay(entry.value)}
            </span>
          </div>
        ))}
        {row?.tacoCiLowPct !== null && row?.tacoCiHighPct !== null && (
          <div className="border-t border-ink/10 pt-1.5 text-[11px] text-ink-subtle">
            TACO 95% CI: {formatPctDisplay(row.tacoCiLowPct)} – {formatPctDisplay(row.tacoCiHighPct)}
          </div>
        )}
      </div>
    </div>
  );
}

function RobustnessTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="rounded-control border border-alpine-200/90 bg-surface/95 p-3 text-xs shadow-popover backdrop-blur-md">
      <p className="font-display text-sm font-semibold text-ink">{label}</p>
      <div className="mt-2 space-y-1.5 font-mono">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-ink-muted">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: entry.color }}
                aria-hidden="true"
              />
              {entry.name}
            </span>
            <span className="font-semibold tabular-nums text-ink">
              {formatPctDisplay(entry.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ResultsDashboardPage() {
  const { isMock } = useAppData();
  const { addToast } = useToast();
  const prefersReducedMotion = useReducedMotion();

  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFigureIdx, setActiveFigureIdx] = useState(null);
  const [copiedCsv, setCopiedCsv] = useState(false);

  const loadResults = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getResults();
      setResults(data);
    } catch (err) {
      setError(err?.message || 'Unable to load evaluation results.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  const models = results?.models || [];
  const baselineModel = models[0] || null;
  const notes = results?.notes || [];
  const figures = results?.figures || [];

  const accuracyChartData = useMemo(
    () =>
      models.map((m) => {
        const tacoAcc = toPct(m.taco?.accuracy);
        const ciLow = toPct(m.taco?.ci_low);
        const ciHigh = toPct(m.taco?.ci_high);

        // VERIFY: Recharts ErrorBar supports asymmetric [minus, plus] tuple values in recharts@2.13.3
        const tacoError =
          tacoAcc !== null && ciLow !== null && ciHigh !== null
            ? [
                Math.max(0, +(tacoAcc - ciLow).toFixed(2)),
                Math.max(0, +(ciHigh - tacoAcc).toFixed(2)),
              ]
            : null;

        return {
          name: m.name,
          tacoAccuracy: tacoAcc,
          tacoMacroF1: toPct(m.taco?.macro_f1),
          trashnetAccuracy: toPct(m.trashnet?.accuracy),
          tacoCiLowPct: ciLow,
          tacoCiHighPct: ciHigh,
          tacoError,
        };
      }),
    [models]
  );

  const robustnessChartData = useMemo(
    () =>
      models.map((m) => ({
        name: m.name,
        lighting: toPct(m.robustness?.lighting),
        contamination: toPct(m.robustness?.contamination),
        condition: toPct(m.robustness?.condition),
        mean: toPct(m.robustness?.mean),
      })),
    [models]
  );

  const buildMetricsCsv = useCallback(() => {
    const header = [
      'model_id',
      'model_name',
      'trashnet_accuracy',
      'trashnet_macro_f1',
      'taco_accuracy',
      'taco_ci_low',
      'taco_ci_high',
      'taco_macro_f1',
      'robustness_lighting',
      'robustness_contamination',
      'robustness_condition',
      'robustness_mean',
    ];
    const rows = models.map((m) => [
      m.id,
      m.name,
      formatPercent(m.trashnet?.accuracy),
      formatPercent(m.trashnet?.macro_f1),
      formatPercent(m.taco?.accuracy),
      formatPercent(m.taco?.ci_low),
      formatPercent(m.taco?.ci_high),
      formatPercent(m.taco?.macro_f1),
      formatPercent(m.robustness?.lighting),
      formatPercent(m.robustness?.contamination),
      formatPercent(m.robustness?.condition),
      formatPercent(m.robustness?.mean),
    ]);
    return [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
  }, [models]);

  const handleCopyCsv = async () => {
    try {
      await navigator.clipboard.writeText(buildMetricsCsv());
      setCopiedCsv(true);
      addToast({ title: 'Metrics CSV copied to clipboard', tone: 'success' });
      window.setTimeout(() => setCopiedCsv(false), 1800);
    } catch {
      addToast({ title: 'Clipboard access blocked by browser', tone: 'warning' });
    }
  };

  const handleDownloadCsv = () => {
    const csv = buildMetricsCsv();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = isMock ? 'sortaugment_demo_results.csv' : 'sortaugment_results.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    addToast({ title: 'Downloaded model metrics CSV', tone: 'success' });
  };

  const activeFigure =
    activeFigureIdx !== null && figures[activeFigureIdx] ? figures[activeFigureIdx] : null;

  return (
    <PageTransition className="space-y-6">
      {/* Header & Source Provenance */}
      <section className="sa-card flex flex-wrap items-start justify-between gap-4 p-5 md:p-6">
        <div className="max-w-3xl space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="font-display text-2xl font-bold text-ink">
              Model Benchmark & Robustness Results
            </h2>
            {isMock && <DemoBadge />}
          </div>
          <p className="text-sm text-ink-muted">
            Comparing baseline vs. augmented sorting classifiers across TrashNet, real-world TACO
            captures (with 95% confidence whiskers), and facility stress axes.
          </p>
          {results?.source && (
            <p className="pt-1 font-mono text-xs text-ink-subtle">Source: {results.source}</p>
          )}
        </div>

        <button type="button" onClick={loadResults} disabled={loading} className="sa-btn-secondary">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh metrics
        </button>
      </section>

      {/* Explicit Demo Data Disclosure */}
      {isMock && (
        <div
          role="note"
          className="flex items-start gap-3 rounded-card border border-amberwarn-border bg-amberwarn-bg/95 px-4 py-3 text-xs leading-relaxed text-amberwarn-text shadow-sm"
        >
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            <strong>Demo data active:</strong> All charts, confidence intervals, and figures below
            are synthetic placeholders generated for offline preview. Set{' '}
            <code className="rounded bg-surface/90 px-1.5 py-0.5 font-mono text-ink">
              VITE_USE_MOCK=false
            </code>{' '}
            in <code className="font-mono">.env</code> and restart the dev server to display live
            evaluation artifacts from your backend.
          </p>
        </div>
      )}

      {/* Loading / Error / Empty States */}
      {loading ? (
        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-2">
            <SkeletonBox className="h-[380px] w-full" />
            <SkeletonBox className="h-[380px] w-full" />
          </div>
          <SkeletonBox className="h-56 w-full" />
        </div>
      ) : error ? (
        <StatePanel
          variant="error"
          title="Could not load evaluation results"
          description={error}
          actionLabel="Retry"
          onAction={loadResults}
        />
      ) : models.length === 0 ? (
        <StatePanel
          icon={BarChart3}
          title="No model benchmarks returned"
          description="The backend returned an empty models list from GET /api/results."
          actionLabel="Retry"
          onAction={loadResults}
        />
      ) : (
        <>
          {/* Charts Grid */}
          <div className="grid gap-6 xl:grid-cols-2">
            <ScrollChartCard
              title="Real-World Accuracy & Macro-F1"
              subtitle="TACO real-world accuracy includes 95% confidence interval whiskers (ci_low – ci_high)."
              badge={
                <span className="rounded-full border border-alpine-200 bg-alpine-50 px-2.5 py-0.5 font-mono text-[11px] font-medium text-alpine-800">
                  95% CI whiskers
                </span>
              }
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={accuracyChartData}
                  margin={{ top: 16, right: 16, left: 0, bottom: 20 }}
                  barGap={6}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(15, 30, 46, 0.08)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#42586E', fontSize: 11 }}
                    axisLine={{ stroke: 'rgba(15, 30, 46, 0.14)' }}
                    tickLine={false}
                    interval={0}
                    angle={-10}
                    textAnchor="end"
                    height={52}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fill: '#5C738A', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                    axisLine={false}
                    tickLine={false}
                    width={46}
                  />
                  <Tooltip
                    content={<BenchmarkTooltip />}
                    cursor={{ fill: 'rgba(2, 116, 179, 0.05)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />
                  <Bar
                    dataKey="tacoAccuracy"
                    name="TACO Accuracy"
                    fill="#0274B3"
                    radius={[6, 6, 0, 0]}
                    isAnimationActive={!prefersReducedMotion}
                    animationDuration={650}
                  >
                    <ErrorBar
                      dataKey="tacoError"
                      width={6}
                      strokeWidth={2}
                      stroke="#0F1E2E"
                      direction="y"
                    />
                  </Bar>
                  <Bar
                    dataKey="tacoMacroF1"
                    name="TACO Macro-F1"
                    fill="#38BDF8"
                    radius={[6, 6, 0, 0]}
                    isAnimationActive={!prefersReducedMotion}
                    animationDuration={750}
                  />
                  <Bar
                    dataKey="trashnetAccuracy"
                    name="TrashNet Accuracy"
                    fill="#94A8BA"
                    radius={[6, 6, 0, 0]}
                    isAnimationActive={!prefersReducedMotion}
                    animationDuration={850}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ScrollChartCard>

            <ScrollChartCard
              title="Stress Robustness by Axis"
              subtitle="Classifier retention under lighting, contamination, and material-condition perturbations."
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={robustnessChartData}
                  margin={{ top: 16, right: 16, left: 0, bottom: 20 }}
                  barGap={4}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(15, 30, 46, 0.08)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#42586E', fontSize: 11 }}
                    axisLine={{ stroke: 'rgba(15, 30, 46, 0.14)' }}
                    tickLine={false}
                    interval={0}
                    angle={-10}
                    textAnchor="end"
                    height={52}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fill: '#5C738A', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                    axisLine={false}
                    tickLine={false}
                    width={46}
                  />
                  <Tooltip
                    content={<RobustnessTooltip />}
                    cursor={{ fill: 'rgba(2, 116, 179, 0.05)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />
                  <Bar
                    dataKey="lighting"
                    name="Lighting"
                    fill="#E09526"
                    radius={[5, 5, 0, 0]}
                    isAnimationActive={!prefersReducedMotion}
                    animationDuration={650}
                  />
                  <Bar
                    dataKey="contamination"
                    name="Contamination"
                    fill="#C45B38"
                    radius={[5, 5, 0, 0]}
                    isAnimationActive={!prefersReducedMotion}
                    animationDuration={720}
                  />
                  <Bar
                    dataKey="condition"
                    name="Condition"
                    fill="#0EA5E9"
                    radius={[5, 5, 0, 0]}
                    isAnimationActive={!prefersReducedMotion}
                    animationDuration={790}
                  />
                  <Bar
                    dataKey="mean"
                    name="Mean Robustness"
                    fill="#0274B3"
                    radius={[5, 5, 0, 0]}
                    isAnimationActive={!prefersReducedMotion}
                    animationDuration={860}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ScrollChartCard>
          </div>

          {/* Complete Quantitative Comparison Table with Baseline Deltas + CSV Export */}
          <section className="sa-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 px-5 py-4 md:px-6">
              <div>
                <h3 className="font-display text-lg font-semibold text-ink">
                  Detailed Model Metrics
                </h3>
                <p className="text-xs text-ink-muted">
                  Percentage-point deltas compare against{' '}
                  <strong className="text-ink">{baselineModel?.name || 'baseline'}</strong>. Missing
                  values show as <code className="font-mono text-ink">n/a</code>.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyCsv}
                  className="sa-btn-secondary px-3 py-1.5 text-xs"
                >
                  {copiedCsv ? (
                    <Check className="h-3.5 w-3.5 text-emeraldok-accent" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {copiedCsv ? 'Copied' : 'Copy CSV'}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  className="sa-btn-secondary px-3 py-1.5 text-xs"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Download CSV
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-ink/10 bg-paper/85 font-mono text-[11px] uppercase tracking-wider text-ink-subtle">
                    <th className="px-5 py-3 font-semibold">Model</th>
                    <th className="px-3 py-3 text-right font-semibold">TrashNet Acc</th>
                    <th className="px-3 py-3 text-right font-semibold">TrashNet F1</th>
                    <th className="px-3 py-3 text-right font-semibold">TACO Acc (95% CI)</th>
                    <th className="px-3 py-3 text-right font-semibold">TACO F1</th>
                    <th className="px-3 py-3 text-right font-semibold">Lighting</th>
                    <th className="px-3 py-3 text-right font-semibold">Contam.</th>
                    <th className="px-3 py-3 text-right font-semibold">Condition</th>
                    <th className="px-5 py-3 text-right font-semibold">Mean Rob.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {models.map((m, rowIdx) => {
                    const isBase = rowIdx === 0;
                    const hasCi =
                      m.taco?.ci_low !== null &&
                      m.taco?.ci_low !== undefined &&
                      m.taco?.ci_high !== null &&
                      m.taco?.ci_high !== undefined;

                    return (
                      <tr key={m.id} className="transition-colors hover:bg-alpine-50/40">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <p className="font-display text-sm font-semibold text-ink">{m.name}</p>
                            {isBase && (
                              <span className="rounded bg-recessed px-1.5 py-0.5 font-mono text-[10px] font-medium text-ink-subtle">
                                BASELINE
                              </span>
                            )}
                          </div>
                          {m.description && (
                            <p className="mt-0.5 max-w-xs text-xs text-ink-subtle">
                              {m.description}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3.5 text-right font-mono tabular-nums text-ink">
                          {formatPercent(m.trashnet?.accuracy)}
                        </td>
                        <td className="px-3 py-3.5 text-right font-mono tabular-nums text-ink-muted">
                          {formatPercent(m.trashnet?.macro_f1)}
                        </td>
                        <td className="px-3 py-3.5 text-right font-mono tabular-nums">
                          <div>
                            <span className="font-semibold text-alpine-800">
                              {formatPercent(m.taco?.accuracy)}
                            </span>
                            {!isBase && (
                              <DeltaPill
                                current={m.taco?.accuracy}
                                baseline={baselineModel?.taco?.accuracy}
                              />
                            )}
                          </div>
                          <span className="block text-[10px] text-ink-subtle">
                            {hasCi
                              ? `${formatPercent(m.taco.ci_low)}–${formatPercent(m.taco.ci_high)}`
                              : 'CI: n/a'}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 text-right font-mono tabular-nums text-ink">
                          {formatPercent(m.taco?.macro_f1)}
                        </td>
                        <td className="px-3 py-3.5 text-right font-mono tabular-nums text-ink-muted">
                          {formatPercent(m.robustness?.lighting)}
                        </td>
                        <td className="px-3 py-3.5 text-right font-mono tabular-nums text-ink-muted">
                          {formatPercent(m.robustness?.contamination)}
                        </td>
                        <td className="px-3 py-3.5 text-right font-mono tabular-nums text-ink-muted">
                          {formatPercent(m.robustness?.condition)}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono font-semibold tabular-nums text-ink">
                          <span>{formatPercent(m.robustness?.mean)}</span>
                          {!isBase && (
                            <DeltaPill
                              current={m.robustness?.mean}
                              baseline={baselineModel?.robustness?.mean}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* "What this means" Notes Panel + Evaluation Figures Gallery */}
          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <section className="sa-card p-5 md:p-6">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-control border border-alpine-200 bg-alpine-50 text-alpine-700">
                  <BookOpen className="h-4 w-4" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-semibold text-ink">What this means</h3>
                  <p className="text-xs text-ink-subtle">Engineering takeaways from /api/results</p>
                </div>
              </div>

              {notes.length === 0 ? (
                <p className="mt-4 text-sm text-ink-muted">
                  No evaluation notes were provided by the backend.
                </p>
              ) : (
                <ul className="mt-5 space-y-3">
                  {notes.map((note, idx) => (
                    <li
                      key={idx}
                      className="flex gap-3 rounded-control border border-ink/10 bg-paper/80 p-3.5 text-sm leading-relaxed text-ink"
                    >
                      <span className="mt-0.5 font-mono text-xs font-semibold text-alpine-700">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Figures Gallery with 3D Tilt Cards + Prev/Next Lightbox */}
            <section className="sa-card p-5 md:p-6">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-control border border-ink/10 bg-paper text-ink-muted">
                    <ImageIcon className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-semibold text-ink">
                      Evaluation Figures
                    </h3>
                    <p className="text-xs text-ink-subtle">
                      Click any diagnostic figure to inspect full resolution.
                    </p>
                  </div>
                </div>
                <span className="font-mono text-xs text-ink-subtle">
                  {figures.length} figure{figures.length === 1 ? '' : 's'}
                </span>
              </div>

              {figures.length === 0 ? (
                <p className="mt-5 rounded-control border border-dashed border-ink/15 p-6 text-center text-sm text-ink-muted">
                  No evaluation figures returned for this report.
                </p>
              ) : (
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {figures.map((fig, idx) => {
                    const resolved = resolveFileUrl(fig.url);
                    return (
                      <TiltCard key={`${fig.title}-${idx}`} maxTilt={5} className="p-0">
                        <button
                          type="button"
                          onClick={() => setActiveFigureIdx(idx)}
                          className="group block w-full text-left"
                        >
                          <div className="relative aspect-[16/10] overflow-hidden bg-surface">
                            <img
                              src={resolved}
                              alt={fig.title}
                              className="h-full w-full object-contain p-1.5 transition-transform duration-200 group-hover:scale-[1.02]"
                            />
                            <span className="absolute bottom-2 right-2 rounded-lg border border-ink/15 bg-surface/90 p-1.5 text-ink shadow-sm backdrop-blur-sm">
                              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </span>
                          </div>
                          <div className="border-t border-ink/10 bg-paper/75 px-3.5 py-2.5">
                            <p className="truncate text-xs font-semibold text-ink">{fig.title}</p>
                          </div>
                        </button>
                      </TiltCard>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </>
      )}

      <Lightbox
        open={Boolean(activeFigure)}
        onClose={() => setActiveFigureIdx(null)}
        title={activeFigure?.title}
        subtitle={results?.source || 'Evaluation figure'}
        singleSrc={activeFigure ? resolveFileUrl(activeFigure.url) : null}
        currentIndex={activeFigureIdx}
        totalCount={figures.length}
        onPrev={
          figures.length > 1
            ? () =>
                setActiveFigureIdx((i) =>
                  i === null ? 0 : (i - 1 + figures.length) % figures.length
                )
            : null
        }
        onNext={
          figures.length > 1
            ? () => setActiveFigureIdx((i) => (i === null ? 0 : (i + 1) % figures.length))
            : null
        }
      />
    </PageTransition>
  );
}