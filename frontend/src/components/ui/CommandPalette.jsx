import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Download,
  History,
  Keyboard,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { NAV_ITEMS } from '../layout/SidebarNav';
import { useJobs } from '../../context/JobsContext';
import { formatTimestamp } from '../../utils/formatters';

const SHORTCUTS = [
  { keys: ['Ctrl / ⌘', 'K'], description: 'Open Quick Jump palette' },
  { keys: ['?'], description: 'Show keyboard shortcuts' },
  { keys: ['[', ']'], description: 'Step Previous / Next image inside Lightbox' },
  { keys: ['←', '→'], description: 'Slide focused Before / After handle' },
  { keys: ['Enter'], description: 'Auto-Swish when Basketball Court is focused' },
  { keys: ['Esc'], description: 'Close active modal or palette' },
];

export function CommandPalette({ open, initialTab = 'search', onClose }) {
  const navigate = useNavigate();
  const { recentJobs } = useJobs();

  const [tab, setTab] = useState(initialTab);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setQuery('');
      setSelectedIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open, initialTab]);

  const actions = useMemo(() => {
    const routeActions = NAV_ITEMS.map((item) => ({
      id: `route_${item.to}`,
      group: 'Pages',
      label: item.label,
      meta: item.to,
      icon: item.icon,
      run: () => navigate(item.to),
    }));

    const doneJobs = recentJobs.filter((j) => j.status === 'done').slice(0, 6);
    const jobActions = doneJobs.flatMap((job) => [
      {
        id: `job_open_${job.job_id}`,
        group: 'Recent Jobs',
        label: `Inspect ${job.job_id} (${job.type})`,
        meta: `${job.n_sources} src · ${job.n_variants} var · ${formatTimestamp(job.created_at)}`,
        icon: History,
        run: () =>
          navigate(
            job.type === 'generate'
              ? `/generate?job=${encodeURIComponent(job.job_id)}`
              : `/augment?job=${encodeURIComponent(job.job_id)}`
          ),
      },
      {
        id: `job_cls_${job.job_id}`,
        group: 'Recent Jobs',
        label: `Check classifier on ${job.job_id}`,
        meta: 'Classifier Check',
        icon: ShieldCheck,
        run: () => navigate(`/classify?job=${encodeURIComponent(job.job_id)}`),
      },
      {
        id: `job_exp_${job.job_id}`,
        group: 'Recent Jobs',
        label: `Export ZIP for ${job.job_id}`,
        meta: 'Export',
        icon: Download,
        run: () => navigate(`/export?job=${encodeURIComponent(job.job_id)}`),
      },
    ]);

    const all = [...routeActions, ...jobActions];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (a) =>
        a.label.toLowerCase().includes(q) ||
        a.meta.toLowerCase().includes(q) ||
        a.group.toLowerCase().includes(q)
    );
  }, [navigate, query, recentJobs]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, tab]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (tab !== 'search' || actions.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % actions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + actions.length) % actions.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const chosen = actions[selectedIndex];
        if (chosen) {
          chosen.run();
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, tab, actions, selectedIndex, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
          role="dialog"
          aria-modal="true"
          aria-label="Quick Jump and Keyboard Shortcuts"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
            className="fixed inset-0 bg-ink/40 backdrop-blur-sm"
            aria-hidden="true"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -6 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 w-full max-w-xl overflow-hidden rounded-panel border border-alpine-200/80 bg-surface/95 shadow-popover backdrop-blur-xl"
          >
            {/* Header Tabs */}
            <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
              <div className="flex items-center gap-1.5" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'search'}
                  onClick={() => setTab('search')}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    tab === 'search'
                      ? 'bg-alpine-600 text-surface'
                      : 'text-ink-muted hover:bg-recessed hover:text-ink'
                  }`}
                >
                  <Search className="h-3.5 w-3.5" aria-hidden="true" />
                  Quick Jump
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'shortcuts'}
                  onClick={() => setTab('shortcuts')}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    tab === 'shortcuts'
                      ? 'bg-alpine-600 text-surface'
                      : 'text-ink-muted hover:bg-recessed hover:text-ink'
                  }`}
                >
                  <Keyboard className="h-3.5 w-3.5" aria-hidden="true" />
                  Shortcuts
                </button>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1 text-ink-subtle hover:bg-recessed hover:text-ink"
                aria-label="Close palette"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {tab === 'search' ? (
              <div>
                <div className="flex items-center gap-2.5 border-b border-ink/10 px-4 py-3">
                  <Search className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden="true" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Jump to a page or recent job ID…"
                    className="w-full bg-transparent text-sm text-ink placeholder:text-ink-subtle focus:outline-none"
                  />
                </div>

                <div className="max-h-[340px] overflow-y-auto p-2">
                  {actions.length === 0 ? (
                    <p className="py-8 text-center text-xs text-ink-muted">
                      No matching pages or jobs for “{query}”.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {actions.map((action, idx) => {
                        const Icon = action.icon;
                        const active = idx === selectedIndex;
                        return (
                          <li key={action.id}>
                            <button
                              type="button"
                              onMouseEnter={() => setSelectedIndex(idx)}
                              onClick={() => {
                                action.run();
                                onClose();
                              }}
                              className={`flex w-full items-center justify-between gap-3 rounded-control px-3 py-2.5 text-left transition-colors ${
                                active
                                  ? 'bg-alpine-50 text-alpine-800'
                                  : 'text-ink hover:bg-paper'
                              }`}
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <div
                                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                                    active
                                      ? 'border-alpine-200 bg-surface text-alpine-600'
                                      : 'border-ink/10 bg-paper text-ink-muted'
                                  }`}
                                >
                                  <Icon className="h-4 w-4" aria-hidden="true" />
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{action.label}</p>
                                  <p className="truncate font-mono text-[11px] text-ink-subtle">
                                    {action.group} · {action.meta}
                                  </p>
                                </div>
                              </div>
                              <ArrowRight
                                className={`h-4 w-4 shrink-0 ${
                                  active ? 'text-alpine-600' : 'text-ink-subtle/50'
                                }`}
                                aria-hidden="true"
                              />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2 p-4">
                {SHORTCUTS.map((sc) => (
                  <div
                    key={sc.description}
                    className="flex items-center justify-between gap-4 rounded-control border border-ink/10 bg-paper/75 px-3.5 py-2.5"
                  >
                    <span className="text-xs font-medium text-ink">{sc.description}</span>
                    <div className="flex items-center gap-1">
                      {sc.keys.map((k) => (
                        <kbd
                          key={k}
                          className="rounded-md border border-ink/15 bg-surface px-2 py-0.5 font-mono text-[11px] font-semibold text-ink shadow-sm"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}