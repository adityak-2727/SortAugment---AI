import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { SidebarNav } from './SidebarNav';
import { TopBar } from './TopBar';
import { ToastViewport } from '../ui/ToastViewport';
import { CommandPalette } from '../ui/CommandPalette';

export function AppShell({ children }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteState, setPaletteState] = useState({ open: false, tab: 'search' });

  // Global keyboard shortcuts: Cmd/Ctrl + K for Quick Jump, ? for Shortcuts
  useEffect(() => {
    const onKeyDown = (e) => {
      const target = e.target;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteState((prev) =>
          prev.open && prev.tab === 'search'
            ? { open: false, tab: 'search' }
            : { open: true, tab: 'search' }
        );
      } else if (!isTyping && !e.metaKey && !e.ctrlKey && e.key === '?') {
        e.preventDefault();
        setPaletteState({ open: true, tab: 'shortcuts' });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="flex min-h-screen text-ink">
      {/* Keyboard skip link for WCAG AA navigation */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-alpine-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-surface focus:shadow-elevated"
      >
        Skip to main content
      </a>

      {/* Desktop persistent frosted sidebar */}
      <div className="hidden w-64 shrink-0 lg:block">
        <div className="sticky top-0 h-screen">
          <SidebarNav />
        </div>
      </div>

      {/* Tablet / narrow viewport slide-over sidebar */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 z-40 bg-ink/25 backdrop-blur-[2px] lg:hidden"
              aria-hidden="true"
            />
            <motion.div
              initial={{ x: -272 }}
              animate={{ x: 0 }}
              exit={{ x: -272 }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              className="fixed inset-y-0 left-0 z-50 w-64 shadow-popover lg:hidden"
              role="dialog"
              aria-modal="true"
              aria-label="Navigation menu"
            >
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="absolute right-3 top-4 z-10 rounded-lg p-1.5 text-ink-subtle hover:bg-recessed hover:text-ink"
                aria-label="Close navigation menu"
              >
                <X className="h-4 w-4" />
              </button>
              <SidebarNav onNavigate={() => setDrawerOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main workspace column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          onOpenDrawer={() => setDrawerOpen(true)}
          onOpenPalette={() => setPaletteState({ open: true, tab: 'search' })}
        />
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1360px] flex-1 px-4 py-6 focus:outline-none md:px-6 lg:px-8 lg:py-8"
        >
          {children}
        </main>
      </div>

      <CommandPalette
        open={paletteState.open}
        initialTab={paletteState.tab}
        onClose={() => setPaletteState((prev) => ({ ...prev, open: false }))}
      />
      <ToastViewport />
    </div>
  );
}