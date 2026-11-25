import { motion } from 'framer-motion';
import { formatPercent } from '../../utils/formatters';

/**
 * Animated confidence bar using GPU-composited scaleX transform only.
 */
export function ConfidenceBar({
  value = 0,
  tone = 'alpine',
  label = null,
  showPercent = true,
  compact = false,
  className = '',
}) {
  const numeric =
    value === null || value === undefined ? null : Math.max(0, Math.min(1, Number(value)));

  const fillClass =
    tone === 'warning'
      ? 'bg-amberwarn-accent'
      : tone === 'error'
        ? 'bg-err-accent'
        : tone === 'emerald'
          ? 'bg-emeraldok-accent'
          : tone === 'neutral'
            ? 'bg-ink-subtle/70'
            : 'bg-gradient-to-r from-alpine-500 to-alpine-600';

  return (
    <div className={`space-y-1 ${className}`}>
      {(label || showPercent) && (
        <div className="flex items-center justify-between gap-2 text-xs">
          {label ? <span className="truncate text-ink-muted">{label}</span> : <span />}
          {showPercent && (
            <span className="font-mono text-[11px] font-medium tabular-nums text-ink">
              {formatPercent(numeric, 1)}
            </span>
          )}
        </div>
      )}
      <div
        className={`w-full overflow-hidden rounded-full bg-recessed ${
          compact ? 'h-1.5' : 'h-2'
        }`}
        role="meter"
        aria-label={label || 'Classifier confidence'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={numeric === null ? 0 : Math.round(numeric * 100)}
      >
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: numeric ?? 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformOrigin: 'left center' }}
          className={`h-full w-full rounded-full ${fillClass}`}
        />
      </div>
    </div>
  );
}