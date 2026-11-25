import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';

/**
 * Custom Alpine Glass frosted dropdown menu (replaces native OS <select>).
 * Full keyboard support: Enter/Space/ArrowDown/ArrowUp/Home/End/Escape.
 */
export function AlpineSelect({
  id,
  labelId,
  value,
  onChange,
  options = [],
  placeholder = 'Select an option',
  emptyLabel = 'No options available',
  disabled = false,
  className = '',
}) {
  const generatedId = useId();
  const listboxId = `${id || generatedId}-listbox`;

  const containerRef = useRef(null);
  const triggerRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(0);

  const isDisabled = disabled || options.length === 0;
  const selectedIndex = options.findIndex((opt) => opt.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;

  // Sync highlight with currently selected item when opening
  useEffect(() => {
    if (open) {
      setHighlightedIdx(selectedIndex >= 0 ? selectedIndex : 0);
    }
  }, [open, selectedIndex]);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  const commitSelection = (option) => {
    if (!option) return;
    onChange?.(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (isDisabled) return;

    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIdx((idx) => (idx + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIdx((idx) => (idx - 1 + options.length) % options.length);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setHighlightedIdx(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setHighlightedIdx(options.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      commitSelection(options[highlightedIdx]);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Frosted Alpine Trigger Button */}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-labelledby={labelId}
        disabled={isDisabled}
        onClick={() => !isDisabled && setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        className={`flex w-full items-center justify-between gap-3 rounded-control border px-3.5 py-2.5 text-left transition-all backdrop-blur-md ${
          open
            ? 'border-alpine-500 bg-surface ring-2 ring-alpine-500/20 shadow-card'
            : 'border-ink/15 bg-surface/90 shadow-sm hover:border-alpine-300 hover:bg-surface'
        } disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {selectedOption ? (
            <>
              <span className="truncate font-mono text-xs font-semibold text-ink">
                {selectedOption.label}
              </span>
              {selectedOption.badge && (
                <span className="shrink-0 rounded-full border border-alpine-200 bg-alpine-50 px-2 py-0.5 font-mono text-[10px] font-medium uppercase text-alpine-800">
                  {selectedOption.badge}
                </span>
              )}
              {selectedOption.meta && (
                <span className="hidden truncate font-mono text-[11px] text-ink-subtle sm:inline">
                  {selectedOption.meta}
                </span>
              )}
            </>
          ) : (
            <span className="truncate font-mono text-xs text-ink-subtle">
              {options.length === 0 ? emptyLabel : placeholder}
            </span>
          )}
        </div>

        <ChevronDown
          className={`h-4 w-4 shrink-0 text-alpine-700 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {/* Frosted Glass Dropdown Menu */}
      <AnimatePresence>
        {open && options.length > 0 && (
          <motion.ul
            id={listboxId}
            role="listbox"
            aria-labelledby={labelId}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-0 right-0 z-40 mt-2 max-h-72 overflow-y-auto rounded-card border border-alpine-200/90 bg-surface/95 p-1.5 shadow-popover backdrop-blur-xl"
          >
            {options.map((opt, idx) => {
              const isSelected = opt.value === value;
              const isHighlighted = idx === highlightedIdx;

              return (
                <li key={opt.value} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlightedIdx(idx)}
                    onClick={() => commitSelection(opt)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                      isSelected
                        ? 'bg-alpine-50/95 text-alpine-900'
                        : isHighlighted
                          ? 'bg-paper text-ink'
                          : 'text-ink hover:bg-paper/80'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-mono text-xs font-semibold text-ink">
                          {opt.label}
                        </span>
                        {opt.badge && (
                          <span
                            className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium uppercase ${
                              isSelected
                                ? 'border-alpine-300 bg-surface text-alpine-800'
                                : 'border-ink/10 bg-paper text-ink-muted'
                            }`}
                          >
                            {opt.badge}
                          </span>
                        )}
                      </div>
                      {opt.meta && (
                        <p className="mt-0.5 truncate font-mono text-[11px] text-ink-subtle">
                          {opt.meta}
                        </p>
                      )}
                    </div>

                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                        isSelected ? 'bg-alpine-600 text-surface' : 'text-transparent'
                      }`}
                      aria-hidden="true"
                    >
                      <Check className="h-3 w-3" />
                    </span>
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}