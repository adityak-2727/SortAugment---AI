import { useMemo, useState } from 'react';
import { ArrowLeftRight, Pause, Play, Radio, Sparkles } from 'lucide-react';
import { useAppData } from '../../context/AppDataContext';
import { getAxisStyle, getClassStyle } from '../../utils/classColors';
import { formatClassLabel, formatEffectName } from '../../utils/formatters';

const SPEEDS = [
  { label: '0.5×', value: 0.5 },
  { label: '1.0×', value: 1 },
  { label: '2.0×', value: 2 },
];

const FALLBACK_EFFECTS = [
  { axis: 'lighting', effect: 'low_light' },
  { axis: 'contamination', effect: 'stain_overlay' },
  { axis: 'condition', effect: 'crumple' },
  { axis: 'lighting', effect: 'glare' },
  { axis: 'contamination', effect: 'occlusion_patches' },
  { axis: 'condition', effect: 'rotation' },
];

function BeltItemIcon({ cls, color }) {
  switch (cls) {
    case 'cardboard':
      return (
        <svg viewBox="0 0 36 36" className="h-7 w-7 shrink-0" aria-hidden="true">
          <rect x="6" y="9" width="24" height="19" rx="3" fill={color.bg} stroke={color.dot} strokeWidth="1.8" />
          <line x1="6" y1="15" x2="30" y2="15" stroke={color.dot} strokeWidth="1.4" opacity="0.7" />
          <line x1="18" y1="9" x2="18" y2="15" stroke={color.dot} strokeWidth="1.4" opacity="0.7" />
        </svg>
      );
    case 'glass':
      return (
        <svg viewBox="0 0 36 36" className="h-7 w-7 shrink-0" aria-hidden="true">
          <path
            d="M15 6h6v5l4 4v14a2 2 0 0 1-2 2H13a2 2 0 0 1-2-2V15l4-4V6z"
            fill={color.bg}
            stroke={color.dot}
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <line x1="15" y1="18" x2="15" y2="26" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'metal':
      return (
        <svg viewBox="0 0 36 36" className="h-7 w-7 shrink-0" aria-hidden="true">
          <rect x="10" y="7" width="16" height="22" rx="4" fill={color.bg} stroke={color.dot} strokeWidth="1.8" />
          <ellipse cx="18" cy="10" rx="6" ry="2" fill="#FFFFFF" stroke={color.dot} strokeWidth="1.2" />
          <line x1="14" y1="15" x2="14" y2="25" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'paper':
      return (
        <svg viewBox="0 0 36 36" className="h-7 w-7 shrink-0" aria-hidden="true">
          <rect x="8" y="6" width="17" height="22" rx="2.5" fill={color.bg} stroke={color.dot} strokeWidth="1.6" />
          <rect x="11" y="9" width="17" height="21" rx="2.5" fill="#FFFFFF" stroke={color.dot} strokeWidth="1.6" />
          <line x1="15" y1="15" x2="24" y2="15" stroke={color.dot} strokeWidth="1.5" opacity="0.7" />
          <line x1="15" y1="20" x2="23" y2="20" stroke={color.dot} strokeWidth="1.5" opacity="0.5" />
        </svg>
      );
    case 'plastic':
      return (
        <svg viewBox="0 0 36 36" className="h-7 w-7 shrink-0" aria-hidden="true">
          <rect x="15" y="5" width="6" height="3" rx="1" fill={color.dot} />
          <path
            d="M14 9h8l3 5v14a2 2 0 0 1-2 2H13a2 2 0 0 1-2-2V14l3-5z"
            fill={color.bg}
            stroke={color.dot}
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <line x1="12" y1="19" x2="24" y2="19" stroke={color.dot} strokeWidth="1.3" opacity="0.55" />
          <line x1="12" y1="23" x2="24" y2="23" stroke={color.dot} strokeWidth="1.3" opacity="0.55" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 36 36" className="h-7 w-7 shrink-0" aria-hidden="true">
          <path
            d="M11 11h14l2 17a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2l2-17z"
            fill={color.bg}
            stroke={color.dot}
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <line x1="9" y1="11" x2="27" y2="11" stroke={color.dot} strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
  }
}

function RollerGear({ paused }) {
  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-alpine-200/90 bg-gradient-to-b from-surface to-recessed shadow-sm"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        data-paused={paused ? 'true' : 'false'}
        className="sa-roller-gear h-5 w-5 text-alpine-600/80"
      >
        <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="3 2.5" />
        <circle cx="12" cy="12" r="2.6" fill="currentColor" />
        <line x1="12" y1="4.5" x2="12" y2="19.5" stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
        <line x1="4.5" y1="12" x2="19.5" y2="12" stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
      </svg>
    </div>
  );
}

/**
 * Compact light-themed Alpine Glass conveyor belt infinite marquee.
 * Dynamically mirrors classes from /api/health and effects from /api/effects.
 */
export function ConveyorMarquee() {
  const { classes, axes } = useAppData();

  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [direction, setDirection] = useState('forward');
  const [stressMode, setStressMode] = useState(true);
  const [inspectedItem, setInspectedItem] = useState(null);

  const streamItems = useMemo(() => {
    const activeClasses = classes.length > 0 ? classes : ['plastic', 'cardboard', 'metal', 'glass', 'paper', 'trash'];
    const effectPool = [];
    axes.forEach((ax) => {
      (ax.effects || []).forEach((ef) => {
        effectPool.push({ axis: ax.id, effect: ef.id, effectLabel: ef.label });
      });
    });
    const resolvedEffects = effectPool.length > 0 ? effectPool : FALLBACK_EFFECTS;

    // Build 8 distinct conveyor frames cycling through dynamic classes and effects
    const count = Math.max(8, activeClasses.length);
    return Array.from({ length: count }).map((_, idx) => {
      const cls = activeClasses[idx % activeClasses.length];
      const ef = resolvedEffects[(idx * 2) % resolvedEffects.length];
      return {
        id: `belt_${idx + 1}`,
        frameCode: `F-${String(104 + idx * 7).padStart(3, '0')}`,
        cls,
        axis: ef.axis,
        effect: ef.effect,
        effectLabel: ef.effectLabel || formatEffectName(ef.effect),
      };
    });
  }, [classes, axes]);

  const durationSec = (30 / speed).toFixed(2);
  const doubledItems = [...streamItems, ...streamItems];

  return (
    <section
      aria-label="Live conveyor sorting stream preview"
      className="sa-card overflow-hidden p-3.5 md:p-4"
    >
      {/* Compact Belt Control Toolbar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-alpine-200 bg-alpine-50 px-2.5 py-0.5 font-mono text-[11px] font-medium text-alpine-800">
            <Radio
              className={`h-3 w-3 text-alpine-600 ${paused ? '' : 'animate-pulse'}`}
              aria-hidden="true"
            />
            Optical Belt Feed
          </span>

          <span className="hidden font-mono text-[11px] text-ink-subtle sm:inline">
            {inspectedItem
              ? `Inspecting ${inspectedItem.frameCode} · ${formatClassLabel(inspectedItem.cls)} (${
                  stressMode ? inspectedItem.effectLabel : 'Clean capture'
                })`
              : 'Hover any item on the belt to pause and inspect'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Stress vs Clean mode pill */}
          <button
            type="button"
            onClick={() => setStressMode((m) => !m)}
            aria-pressed={stressMode}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-[11px] font-medium transition-colors ${
              stressMode
                ? 'border-alpine-200 bg-alpine-50 text-alpine-800'
                : 'border-ink/15 bg-surface text-ink-muted hover:text-ink'
            }`}
          >
            <Sparkles className="h-3 w-3 text-alpine-600" aria-hidden="true" />
            <span>{stressMode ? 'Stress Stream' : 'Clean Feed'}</span>
          </button>

          {/* Speed selector */}
          <div
            className="inline-flex items-center rounded-full border border-ink/10 bg-paper/90 p-0.5"
            role="group"
            aria-label="Belt speed"
          >
            {SPEEDS.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => setSpeed(s.value)}
                aria-pressed={speed === s.value}
                className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-medium transition-colors ${
                  speed === s.value
                    ? 'bg-alpine-600 text-surface shadow-sm'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Direction toggle */}
          <button
            type="button"
            onClick={() => setDirection((d) => (d === 'forward' ? 'reverse' : 'forward'))}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-ink/15 bg-surface text-ink-muted transition-colors hover:border-alpine-300 hover:text-ink"
            aria-label={`Reverse conveyor direction (currently ${direction})`}
            title="Reverse belt direction"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          {/* Play / Pause */}
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-pressed={paused}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-ink/15 bg-surface px-2.5 font-mono text-[11px] font-medium text-ink transition-colors hover:border-alpine-300 hover:bg-alpine-50/70"
            aria-label={paused ? 'Resume conveyor belt' : 'Pause conveyor belt'}
          >
            {paused ? (
              <>
                <Play className="h-3 w-3 text-alpine-600" aria-hidden="true" />
                <span>Play</span>
              </>
            ) : (
              <>
                <Pause className="h-3 w-3 text-alpine-600" aria-hidden="true" />
                <span>Pause</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Light-Themed Compact Conveyor Belt Assembly (~104px tall) */}
      <div className="sa-belt-viewport relative flex items-center gap-2.5 rounded-control border border-alpine-200/80 bg-gradient-to-b from-[#EDF5FC] via-[#F7FBFF] to-[#E7F1F9] px-2.5 py-2 shadow-inner">
        {/* Left roller wheel */}
        <RollerGear paused={paused} />

        {/* Belt bed viewport */}
        <div className="relative h-[88px] flex-1 overflow-hidden rounded-xl border border-alpine-200/70 bg-gradient-to-b from-[#E7F1F9] via-[#F4F9FD] to-[#E5EFF8]">
          {/* Top & Bottom brushed light-aluminum rails with precision ticks */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 z-20 h-2 border-b border-alpine-300/50 bg-gradient-to-b from-white to-[#DCEAF5]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(90deg, rgba(2,116,179,0.22) 0 1px, transparent 1px 16px)',
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-2 border-t border-alpine-300/50 bg-gradient-to-t from-white to-[#DCEAF5]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(90deg, rgba(2,116,179,0.22) 0 1px, transparent 1px 16px)',
            }}
          />

          {/* Subtle moving light slat bed */}
          <div
            aria-hidden="true"
            data-paused={paused ? 'true' : 'false'}
            style={{ animationDuration: `${(1.15 / speed).toFixed(2)}s` }}
            className="sa-belt-slat-layer pointer-events-none absolute inset-y-2 -left-12 -right-12"
          />

          {/* Soft light edge fades so items glide smoothly out from the rollers */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-2 left-0 z-20 w-10 bg-gradient-to-r from-[#EAF3FA] to-transparent"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-2 right-0 z-20 w-10 bg-gradient-to-l from-[#EAF3FA] to-transparent"
          />

          {/* Central Alpine Optical AI Scanner Gate */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center justify-between"
          >
            <span className="rounded-b-md border border-t-0 border-alpine-300 bg-surface/95 px-2 py-0.5 font-mono text-[9px] font-semibold tracking-wider text-alpine-700 shadow-sm">
              AI SCAN GATE
            </span>
            <div className="h-full w-10 bg-gradient-to-r from-alpine-500/0 via-alpine-500/15 to-alpine-500/0">
              <div className="mx-auto h-full w-[1.5px] bg-gradient-to-b from-alpine-500/80 via-alpine-500/45 to-alpine-500/80" />
            </div>
          </div>

          {/* Infinite Marquee Item Track */}
          <div
            data-paused={paused ? 'true' : 'false'}
            data-direction={direction}
            style={{ animationDuration: `${durationSec}s` }}
            className="sa-belt-track relative z-10 h-full items-center gap-3 px-2"
          >
            {doubledItems.map((item, idx) => {
              const clsStyle = getClassStyle(item.cls, classes);
              const axisStyle = getAxisStyle(item.axis);

              const stressVisualFilter =
                stressMode && item.axis === 'lighting'
                  ? 'brightness(0.84) contrast(1.15)'
                  : stressMode && item.axis === 'contamination'
                    ? 'sepia(0.28) saturate(0.9)'
                    : stressMode && item.axis === 'condition'
                      ? 'contrast(1.06)'
                      : 'none';

              return (
                <div
                  key={`${item.id}-${idx}`}
                  onMouseEnter={() => setInspectedItem(item)}
                  onMouseLeave={() => setInspectedItem(null)}
                  className="group flex h-[60px] shrink-0 items-center gap-2.5 rounded-xl border border-ink/10 bg-surface/95 px-3 shadow-sm transition-transform duration-200 hover:-translate-y-0.5 hover:border-alpine-300 hover:shadow-card"
                >
                  <div
                    style={{
                      filter: stressVisualFilter,
                      transform:
                        stressMode && item.axis === 'condition' ? 'rotate(-7deg)' : undefined,
                    }}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ink/10 bg-paper/90 transition-transform"
                  >
                    <BeltItemIcon cls={item.cls} color={clsStyle} />
                  </div>

                  <div className="min-w-[116px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display text-xs font-semibold text-ink">
                        {formatClassLabel(item.cls)}
                      </span>
                      <span className="font-mono text-[10px] text-ink-subtle">
                        {item.frameCode}
                      </span>
                    </div>

                    <div className="mt-1 flex items-center gap-1.5">
                      {stressMode ? (
                        <span
                          style={{
                            backgroundColor: axisStyle.bg,
                            color: axisStyle.text,
                            borderColor: axisStyle.border,
                          }}
                          className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-mono text-[9.5px] font-medium leading-none"
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: axisStyle.dot }}
                          />
                          {item.effectLabel}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emeraldok-border bg-emeraldok-bg px-1.5 py-0.5 font-mono text-[9.5px] font-medium leading-none text-emeraldok-text">
                          <span className="h-1.5 w-1.5 rounded-full bg-emeraldok-accent" />
                          Clean Capture
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right roller wheel */}
        <RollerGear paused={paused} />
      </div>
    </section>
  );
}