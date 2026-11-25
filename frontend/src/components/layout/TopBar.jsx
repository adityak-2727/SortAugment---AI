import { CheckCircle2, Command, Loader2, Menu, RefreshCw } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppData } from '../../context/AppDataContext';
import { useJobs } from '../../context/JobsContext';
import { DemoBadge } from '../ui/DemoBadge';
import { NAV_ITEMS } from './SidebarNav';

export function TopBar({ onOpenDrawer, onOpenPalette }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isMock, classes, gpu, loading, error, refresh } = useAppData();
  const {
    activeJobId,
    activeJobType,
    activeJob,
    polling,
    lastCompletedJob,
    dismissCompletedNotice,
  } = useJobs();

  const currentNav =
    NAV_ITEMS.find((item) =>
      item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)
    ) || NAV_ITEMS[0];

  const isJobRunning =
    polling || activeJob?.status === 'queued' || activeJob?.status === 'running';
  const doneCount = activeJob?.progress?.done || 0;
  const totalCount = activeJob?.progress?.total || 0;
  const jobPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  const targetActiveRoute =
    activeJobType === 'generate'
      ? `/generate?job=${encodeURIComponent(activeJobId || '')}`
      : `/augment?job=${encodeURIComponent(activeJobId || '')}`;

  const showFinishedPill =
    !isJobRunning &&
    lastCompletedJob &&
    !location.search.includes(lastCompletedJob.job_id);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-ink/10 bg-surface/75 px-4 backdrop-blur-xl md:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenDrawer}
          className="inline-flex h-9 w-9 items-center justify-center rounded-control border border-ink/15 bg-surface/90 text-ink hover:bg-alpine-50 lg:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div>
          <h1 className="font-display text-lg font-semibold leading-tight text-ink">
            {currentNav.label}
          </h1>
          <p className="hidden text-xs text-ink-subtle sm:block">
            Recyclable Material Image Augmenter · Alpine Glass
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        {/* Persistent Background Job Progress Pill */}
        {isJobRunning && activeJobId && (
          <button
            type="button"
            onClick={() => navigate(targetActiveRoute)}
            className="inline-flex items-center gap-2 rounded-full border border-alpine-300 bg-alpine-50 px-3 py-1 font-mono text-[11px] font-medium text-alpine-800 shadow-sm transition-colors hover:bg-alpine-100"
            title="Click to jump back to running job"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin text-alpine-600" aria-hidden="true" />
            <span className="hidden sm:inline">{activeJobId}</span>
            <span className="tabular-nums font-semibold">
              {totalCount > 0 ? `${jobPct}%` : 'Queued'}
            </span>
          </button>
        )}

        {/* Clickable Completed Job Pill when user navigated elsewhere */}
        {showFinishedPill && (
          <button
            type="button"
            onClick={() => {
              const dest =
                lastCompletedJob.type === 'generate'
                  ? `/generate?job=${encodeURIComponent(lastCompletedJob.job_id)}`
                  : `/augment?job=${encodeURIComponent(lastCompletedJob.job_id)}`;
              dismissCompletedNotice();
              navigate(dest);
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-emeraldok-border bg-emeraldok-bg px-3 py-1 font-mono text-[11px] font-medium text-emeraldok-text shadow-sm hover:opacity-90"
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-emeraldok-accent" aria-hidden="true" />
            <span>View {lastCompletedJob.job_id}</span>
          </button>
        )}

        {/* Quick Jump Palette Trigger (Cmd/Ctrl + K) */}
        <button
          type="button"
          onClick={onOpenPalette}
          className="hidden items-center gap-1.5 rounded-full border border-ink/12 bg-surface/90 px-2.5 py-1 font-mono text-[11px] text-ink-muted transition-colors hover:border-alpine-300 hover:text-ink sm:inline-flex"
          title="Quick Jump (Ctrl+K or Cmd+K) · Press ? for shortcuts"
        >
          <Command className="h-3 w-3 text-alpine-600" aria-hidden="true" />
          <span>K</span>
        </button>

        {isMock && <DemoBadge />}

        {!loading && !error && (
          <span className="hidden items-center gap-1.5 rounded-full border border-ink/10 bg-surface/90 px-3 py-1 font-mono text-[11px] text-ink-muted md:inline-flex">
            <span
              className={`h-2 w-2 rounded-full ${
                gpu?.available ? 'bg-emeraldok-accent' : 'bg-amberwarn-accent'
              }`}
              aria-hidden="true"
            />
            {classes.length} classes · {gpu?.available ? 'GPU ready' : 'CPU only'}
          </span>
        )}

        {error && (
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-1.5 rounded-full border border-err-border bg-err-bg px-3 py-1 text-xs font-medium text-err-text hover:opacity-90"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry API
          </button>
        )}
      </div>
    </header>
  );
}