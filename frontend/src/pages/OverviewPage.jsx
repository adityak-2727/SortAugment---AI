import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import {
  ArrowRight,
  BarChart3,
  Cpu,
  Download,
  Images,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Upload,
} from 'lucide-react';
import { getResults } from '../api/client';
import { useAppData } from '../context/AppDataContext';
import { useCountUp } from '../hooks/useCountUp';
import { formatPercent } from '../utils/formatters';
import { PageTransition } from '../components/ui/PageTransition';
import { ConveyorMarquee } from '../components/ui/ConveyorMarquee';
import { TiltCard } from '../components/ui/TiltCard';
import { DemoBadge } from '../components/ui/DemoBadge';
import { SkeletonBox } from '../components/ui/Skeleton';
import { StatePanel } from '../components/ui/StatePanel';

const PIPELINE_STEPS = [
  {
    step: '01',
    title: 'Upload',
    detail: 'Drop conveyor belt photos or class-named folders directly from line cameras.',
    icon: Upload,
  },
  {
    step: '02',
    title: 'Vary',
    detail: 'Simulate facility lighting shifts, residue contamination, and physical deformation.',
    icon: SlidersHorizontal,
  },
  {
    step: '03',
    title: 'Check',
    detail: 'Audit how the sorting classifier reacts to each variant and spot prediction flips.',
    icon: ShieldCheck,
  },
  {
    step: '04',
    title: 'Export',
    detail: 'Download a class-structured training ZIP with full manifest.csv reproducibility.',
    icon: Download,
  },
];

const QUICK_LINKS = [
  {
    to: '/augment',
    title: 'Augment Studio',
    description:
      '3-step wizard to upload belt photos, configure stress axes, and inspect before/after sliders.',
    icon: SlidersHorizontal,
    cta: 'Start job',
    tag: 'WORKFLOW',
  },
  {
    to: '/classify',
    title: 'Classifier Check',
    description:
      'Compare original vs. augmented predictions and locate failure cases on your sorting line.',
    icon: ShieldCheck,
    cta: 'Inspect flips',
    tag: 'AUDIT',
  },
  {
    to: '/gallery',
    title: 'Generative Gallery',
    description:
      'Browse curated img2img and inpaint material variations filtered by class and axis.',
    icon: Images,
    cta: 'Open gallery',
    tag: 'ARCHIVE',
  },
  {
    to: '/generate',
    title: 'Live Generate',
    description:
      'Run GPU-backed generative synthesis on uploaded recyclable items with live progress.',
    icon: Cpu,
    cta: 'Check GPU',
    tag: 'DIFFUSION',
  },
  {
    to: '/results',
    title: 'Results Dashboard',
    description:
      'Compare baseline vs. augmented accuracy, Macro-F1, confidence intervals, and robustness.',
    icon: BarChart3,
    cta: 'View benchmarks',
    tag: 'METRICS',
  },
  {
    to: '/export',
    title: 'Export Training Set',
    description:
      'Package any completed job into a clean ZIP archive with optional original images.',
    icon: Download,
    cta: 'Package ZIP',
    tag: 'DATASET',
  },
];

function AnimatedStatTile({ label, valueFraction, subtext, highlight = false, isDemo = false }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.35 });
  const animated = useCountUp(valueFraction, { durationMs: 750, enabled: inView });

  return (
    <div ref={ref} className="h-full">
      <TiltCard
        maxTilt={7}
        className={`h-full p-6 ${
          highlight ? 'border-alpine-200/90 bg-gradient-to-br from-alpine-50/90 to-white/90' : ''
        }`}
      >
        <div className="flex h-full flex-col justify-between">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
              {label}
            </span>
            {isDemo && (
              <span className="rounded-md bg-amberwarn-bg px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amberwarn-text">
                DEMO
              </span>
            )}
          </div>
          <div className="mt-4 font-mono text-4xl font-semibold tracking-tight tabular-nums text-ink">
            {valueFraction === null || valueFraction === undefined
              ? 'n/a'
              : formatPercent(animated, 1)}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-muted">{subtext}</p>
        </div>
      </TiltCard>
    </div>
  );
}

export function OverviewPage() {
  const { classes, axes, isMock } = useAppData();
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadResults = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getResults();
      setResults(data);
    } catch (err) {
      setError(err?.message || 'Unable to load evaluation metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadResults();
  }, []);

  const models = results?.models || [];
  const baseline = models[0] || null;
  const bestTacoModel = models.reduce((best, item) => {
    const cur = item?.taco?.accuracy;
    const prev = best?.taco?.accuracy;
    if (cur === null || cur === undefined) return best;
    if (!best || prev === null || prev === undefined || cur > prev) return item;
    return best;
  }, null);

  const bestRobustModel = models.reduce((best, item) => {
    const cur = item?.robustness?.mean;
    const prev = best?.robustness?.mean;
    if (cur === null || cur === undefined) return best;
    if (!best || prev === null || prev === undefined || cur > prev) return item;
    return best;
  }, null);

  const tacoGain =
    bestTacoModel?.taco?.accuracy !== null &&
    bestTacoModel?.taco?.accuracy !== undefined &&
    baseline?.taco?.accuracy !== null &&
    baseline?.taco?.accuracy !== undefined
      ? bestTacoModel.taco.accuracy - baseline.taco.accuracy
      : null;

  const totalEffects = axes.reduce((acc, a) => acc + (a.effects?.length || 0), 0);

  return (
    <PageTransition className="space-y-8">
      {/* Editorial Alpine Glass Hero */}
      <section className="sa-card relative overflow-hidden p-6 md:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-alpine-300/20 blur-3xl"
        />
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-alpine-200 bg-alpine-50 px-3 py-1 font-mono text-xs font-medium text-alpine-800">
                <Sparkles className="h-3.5 w-3.5 text-alpine-600" aria-hidden="true" />
                Sorting-Line Robustness Workbench
              </span>
              {isMock && <DemoBadge />}
            </div>

            <h2 className="font-display text-3xl font-bold leading-tight text-ink md:text-4xl">
              Stress-test recyclable classifiers before they hit the conveyor belt.
            </h2>

            <p className="text-sm leading-relaxed text-ink-muted md:text-base">
              Clean studio datasets fail under glare, food residue, and crushed packaging.
              SortAugment AI synthesizes realistic lighting, contamination, and material-condition
              variations from plant line photos so your sorting models generalize in live MRF
              facilities.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link to="/augment" className="sa-btn-primary">
              Launch Augment Studio
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link to="/results" className="sa-btn-secondary">
              Inspect Results
            </Link>
          </div>
        </div>

        <div className="relative z-10 mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-ink/10 pt-4 font-mono text-xs text-ink-subtle">
          <span>{classes.length || '—'} material classes from /api/health</span>
          <span>
            {axes.length || 3} stress axes · {totalEffects || 14} canonical effects
          </span>
          <span>Offline-capable local workbench</span>
        </div>
      </section>

      {/* Compact Light-Themed Alpine Conveyor Belt Marquee */}
      <ConveyorMarquee />

      {/* Big 3D Hover-Moving Pipeline Cards */}
      <section aria-labelledby="pipeline-heading" className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h3 id="pipeline-heading" className="font-display text-xl font-semibold text-ink">
              Four-Stage Facility Pipeline
            </h3>
            <p className="text-sm text-ink-muted">
              From raw conveyor captures to a verified, versioned training archive.
            </p>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PIPELINE_STEPS.map((item, idx) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: idx * 0.07,
                  duration: 0.28,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="relative h-full"
              >
                <TiltCard maxTilt={7} className="h-full p-6">
                  <div className="flex h-full flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex h-11 w-11 items-center justify-center rounded-control border border-alpine-200 bg-alpine-50 text-alpine-700 shadow-sm">
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <span className="font-mono text-xs font-semibold text-ink-subtle">
                          STEP {item.step}
                        </span>
                      </div>
                      <h4 className="mt-5 font-display text-xl font-semibold text-ink">
                        {item.title}
                      </h4>
                      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{item.detail}</p>
                    </div>
                  </div>
                </TiltCard>

                {idx < PIPELINE_STEPS.length - 1 && (
                  <ArrowRight
                    className="pointer-events-none absolute -right-3.5 top-1/2 z-20 hidden h-6 w-6 -translate-y-1/2 rounded-full border border-alpine-200 bg-surface p-1 text-alpine-600 shadow-sm lg:block"
                    aria-hidden="true"
                  />
                )}
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Big 3D Stat Tiles from /api/results */}
      <section aria-labelledby="metrics-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 id="metrics-heading" className="font-display text-xl font-semibold text-ink">
              Benchmark Snapshot
            </h3>
            <p className="text-sm text-ink-muted">
              {results?.source || 'Pulled live from GET /api/results'}
            </p>
          </div>
          {isMock && (
            <span className="text-xs font-medium text-amberwarn-text">
              Synthetic demonstration metrics — not live plant evaluation results
            </span>
          )}
        </div>

        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="sa-card space-y-3 p-6">
                <SkeletonBox className="h-3 w-28" />
                <SkeletonBox className="h-9 w-24" />
                <SkeletonBox className="h-3 w-40" />
              </div>
            ))}
          </div>
        ) : error ? (
          <StatePanel
            variant="error"
            title="Could not load /api/results"
            description={error}
            actionLabel="Retry"
            onAction={loadResults}
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <AnimatedStatTile
              label="Top TACO Accuracy"
              valueFraction={bestTacoModel?.taco?.accuracy ?? null}
              subtext={bestTacoModel ? bestTacoModel.name : 'No model data'}
              highlight
              isDemo={isMock}
            />
            <AnimatedStatTile
              label="TACO Gain vs Baseline"
              valueFraction={tacoGain}
              subtext={
                baseline
                  ? `Over ${baseline.name} (${formatPercent(baseline?.taco?.accuracy)})`
                  : 'Baseline unavailable'
              }
              isDemo={isMock}
            />
            <AnimatedStatTile
              label="Mean Robustness"
              valueFraction={bestRobustModel?.robustness?.mean ?? null}
              subtext={
                bestRobustModel
                  ? `${bestRobustModel.name} across 3 axes`
                  : 'Robustness unavailable'
              }
              isDemo={isMock}
            />
            <AnimatedStatTile
              label="Top TrashNet Accuracy"
              valueFraction={bestTacoModel?.trashnet?.accuracy ?? null}
              subtext={`Macro-F1: ${formatPercent(bestTacoModel?.trashnet?.macro_f1)}`}
              isDemo={isMock}
            />
          </div>
        )}
      </section>

      {/* Big 3D Hover-Moving Workbench Module Cards */}
      <section aria-labelledby="workspace-heading" className="space-y-4">
        <h3 id="workspace-heading" className="font-display text-xl font-semibold text-ink">
          Workbench Modules
        </h3>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LINKS.map((tile) => {
            const Icon = tile.icon;
            return (
              <Link key={tile.to} to={tile.to} className="group block h-full">
                <TiltCard maxTilt={6} className="h-full p-6">
                  <div className="flex h-full flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex h-11 w-11 items-center justify-center rounded-control border border-ink/10 bg-paper text-ink transition-colors group-hover:border-alpine-200 group-hover:bg-alpine-50 group-hover:text-alpine-700">
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <span className="font-mono text-[10px] font-semibold tracking-wider text-ink-subtle">
                          {tile.tag}
                        </span>
                      </div>
                      <h4 className="mt-5 font-display text-lg font-semibold text-ink">
                        {tile.title}
                      </h4>
                      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                        {tile.description}
                      </p>
                    </div>
                    <div className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-alpine-700">
                      <span>{tile.cta}</span>
                      <ArrowRight
                        className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1"
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                </TiltCard>
              </Link>
            );
          })}
        </div>
      </section>
    </PageTransition>
  );
}