import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { BeforeAfterSlider } from './BeforeAfterSlider';

/**
 * Shared-element modal lightbox for inspecting single images or full-size
 * before/after pairs with optional Prev/Next stepping ([ and ] keys so
 * ArrowLeft / ArrowRight remain dedicated to the before/after slider).
 */
export function Lightbox({
  open,
  onClose,
  title,
  subtitle,
  layoutId = undefined,
  beforeSrc = null,
  afterSrc = null,
  singleSrc = null,
  beforeLabel = 'Original',
  afterLabel = 'Augmented',
  footer = null,
  onPrev = null,
  onNext = null,
  currentIndex = null,
  totalCount = null,
}) {
  const hasStepper = Boolean((onPrev || onNext) && totalCount > 1);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === '[' && onPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === ']' && onNext) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, onPrev, onNext]);

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8"
          role="dialog"
          aria-modal="true"
          aria-label={title || 'Image preview'}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 bg-ink/55 backdrop-blur-sm"
            aria-hidden="true"
          />

          <motion.div
            layoutId={layoutId}
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 360, damping: 32 }}
            className="relative z-10 flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-panel border border-ink/15 bg-surface shadow-popover"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-ink/10 px-5 py-4">
              <div className="min-w-0">
                <h3 className="truncate font-display text-lg font-semibold text-ink">{title}</h3>
                {subtitle && (
                  <p className="mt-0.5 truncate font-mono text-xs text-ink-subtle">{subtitle}</p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {hasStepper && (
                  <div className="flex items-center gap-1 rounded-control border border-ink/10 bg-paper p-0.5">
                    <button
                      type="button"
                      onClick={onPrev}
                      disabled={!onPrev}
                      title="Previous item ([)"
                      aria-label="Previous item"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface hover:text-ink disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    {currentIndex !== null && (
                      <span className="px-1.5 font-mono text-[11px] font-medium tabular-nums text-ink">
                        {currentIndex + 1}/{totalCount}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={onNext}
                      disabled={!onNext}
                      title="Next item (])"
                      aria-label="Next item"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface hover:text-ink disabled:opacity-40"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-ink/10 text-ink-muted transition-colors hover:bg-recessed hover:text-ink"
                  aria-label="Close preview"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Media canvas */}
            <div className="overflow-y-auto p-5">
              {beforeSrc && afterSrc ? (
                <BeforeAfterSlider
                  key={`${beforeSrc}-${afterSrc}`}
                  beforeSrc={beforeSrc}
                  afterSrc={afterSrc}
                  beforeLabel={beforeLabel}
                  afterLabel={afterLabel}
                  alt={title || 'Preview'}
                  aspectClass="aspect-[16/10]"
                  allowZoom
                />
              ) : (
                <div className="overflow-hidden rounded-control border border-ink/10 bg-paper">
                  <img
                    src={singleSrc || afterSrc || beforeSrc}
                    alt={title || 'Preview'}
                    className="max-h-[62vh] w-full object-contain"
                  />
                </div>
              )}

              {footer && <div className="mt-4">{footer}</div>}

              {hasStepper && (
                <p className="mt-3 text-right font-mono text-[10px] text-ink-subtle">
                  Tip: press <kbd className="rounded border border-ink/15 bg-paper px-1">[</kbd> /{' '}
                  <kbd className="rounded border border-ink/15 bg-paper px-1">]</kbd> to step items
                  · <kbd className="rounded border border-ink/15 bg-paper px-1">←</kbd>{' '}
                  <kbd className="rounded border border-ink/15 bg-paper px-1">→</kbd> to slide split
                </p>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}