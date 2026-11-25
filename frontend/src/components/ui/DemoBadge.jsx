import { FlaskConical } from 'lucide-react';

export function DemoBadge({ compact = false, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-amberwarn-border bg-amberwarn-bg px-2.5 py-1 font-mono text-[11px] font-medium text-amberwarn-text ${className}`}
      title="Running offline with simulated canvas augmentations and demonstration metrics (VITE_USE_MOCK=true)"
    >
      <FlaskConical className="h-3.5 w-3.5 shrink-0 text-amberwarn-text" aria-hidden="true" />
      <span>{compact ? 'Demo' : 'Demo data'}</span>
    </span>
  );
}