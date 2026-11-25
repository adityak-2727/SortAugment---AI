import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BarChart3,
  Cpu,
  Download,
  Images,
  LayoutDashboard,
  Recycle,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { useAppData } from '../../context/AppDataContext';
import { DemoBadge } from '../ui/DemoBadge';

export const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/augment', label: 'Augment Studio', icon: SlidersHorizontal },
  { to: '/classify', label: 'Classifier Check', icon: ShieldCheck },
  { to: '/gallery', label: 'Generative Gallery', icon: Images },
  { to: '/generate', label: 'Live Generate', icon: Cpu },
  { to: '/results', label: 'Results', icon: BarChart3 },
  { to: '/export', label: 'Export', icon: Download },
];

export function SidebarNav({ onNavigate }) {
  const location = useLocation();
  const { isMock, gpu, modelLoaded, loading, error } = useAppData();

  return (
    <aside className="flex h-full flex-col border-r border-ink/10 bg-surface/80 px-3.5 py-5 backdrop-blur-xl">
      {/* Brand header */}
      <div className="mb-6 flex items-center gap-3 px-2">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-gradient-to-br from-alpine-500 to-alpine-700 text-surface shadow-card">
          <Recycle className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-display text-base font-bold text-ink">
              SortAugment
            </span>
            <span className="rounded-md border border-alpine-200 bg-alpine-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-alpine-700">
              AI
            </span>
          </div>
          <p className="truncate text-xs text-ink-subtle">Alpine Sorting Bench</p>
        </div>
      </div>

      {/* Navigation items with shared-element active indicator */}
      <nav aria-label="Primary navigation" className="flex-1 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = item.end
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to);

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={`relative flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive ? 'text-alpine-800' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="active-sidebar-pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  className="absolute inset-0 rounded-control border border-alpine-200/90 bg-alpine-50/95 shadow-sm"
                  aria-hidden="true"
                />
              )}
              <Icon
                className={`relative z-10 h-4 w-4 shrink-0 ${
                  isActive ? 'text-alpine-600' : 'text-ink-subtle'
                }`}
                aria-hidden="true"
              />
              <span className="relative z-10 truncate">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Environment & Runtime status footer */}
      <div className="mt-4 space-y-2.5 rounded-card border border-ink/10 bg-paper/85 p-3 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-ink-subtle">
            Runtime
          </span>
          {isMock ? (
            <DemoBadge compact />
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emeraldok-border bg-emeraldok-bg px-2 py-0.5 font-mono text-[11px] font-medium text-emeraldok-text">
              <span className="h-1.5 w-1.5 rounded-full bg-emeraldok-accent" />
              Live API
            </span>
          )}
        </div>

        <div className="space-y-1 text-xs text-ink-muted">
          <div className="flex items-center justify-between">
            <span>Classifier</span>
            <span className="font-mono text-[11px] text-ink">
              {loading ? 'Checking…' : error ? 'Offline' : modelLoaded ? 'Loaded' : 'Idle'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>GPU</span>
            <span className="font-mono text-[11px] text-ink">
              {loading
                ? 'Checking…'
                : gpu?.available
                  ? `${gpu.vram_gb ? `${gpu.vram_gb} GB` : 'Ready'}`
                  : 'Unavailable'}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}