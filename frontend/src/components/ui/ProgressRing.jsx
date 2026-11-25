import { motion } from 'framer-motion';

export function ProgressRing({
  value = 0,
  total = 100,
  size = 116,
  strokeWidth = 8,
  label = null,
  sublabel = null,
}) {
  const safeTotal = Math.max(1, Number(total) || 1);
  const safeValue = Math.max(0, Math.min(safeTotal, Number(value) || 0));
  const ratio = safeValue / safeTotal;
  const percent = Math.round(ratio * 100);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - ratio);

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label || 'Job progress'}
    >
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="alpine-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0EA5E9" />
            <stop offset="100%" stopColor="#0274B3" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(2, 116, 179, 0.14)"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#alpine-ring-grad)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={false}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-mono text-xl font-semibold tabular-nums text-ink">
          {percent}%
        </span>
        {sublabel && (
          <span className="mt-0.5 font-mono text-[11px] text-ink-subtle">{sublabel}</span>
        )}
      </div>
    </div>
  );
}