import { useCallback, useRef, useState } from 'react';
import { MoveHorizontal, ZoomIn, ZoomOut } from 'lucide-react';

/**
 * Interactive Before/After image comparator:
 * - Drag via mouse or touch (Pointer Events with capture)
 * - Keyboard accessible (ArrowLeft / ArrowRight / Home / End / PageUp / PageDown)
 * - Optional synchronized 2x hover zoom to inspect subtle stains, noise, or creases
 */
export function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  beforeLabel = 'Original',
  afterLabel = 'Augmented',
  alt = 'Comparison image',
  aspectClass = 'aspect-[4/3]',
  allowZoom = true,
  initialPosition = 50,
  className = '',
}) {
  const containerRef = useRef(null);
  const [position, setPosition] = useState(initialPosition);
  const [dragging, setDragging] = useState(false);
  const [zoomEnabled, setZoomEnabled] = useState(false);
  const [zoomOrigin, setZoomOrigin] = useState({ x: 50, y: 50 });

  const updateFromClientX = useCallback((clientX) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.max(0, Math.min(100, pct)));
  }, []);

  const handlePointerDown = (e) => {
    if (e.target.closest('button[data-zoom-toggle]')) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragging(true);
    updateFromClientX(e.clientX);
  };

  const handlePointerMove = (e) => {
    const el = containerRef.current;
    if (zoomEnabled && el) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setZoomOrigin({
          x: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
          y: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)),
        });
      }
    }
    if (dragging) {
      updateFromClientX(e.clientX);
    }
  };

  const handlePointerUp = (e) => {
    if (dragging) {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      setDragging(false);
    }
  };

  const handleKeyDown = (e) => {
    const step = e.shiftKey ? 10 : 3;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setPosition((p) => Math.max(0, p - step));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setPosition((p) => Math.min(100, p + step));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setPosition(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setPosition(100);
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      setPosition((p) => Math.max(0, p - 15));
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      setPosition((p) => Math.min(100, p + 15));
    }
  };

  const imageZoomStyle = zoomEnabled
    ? {
        transform: 'scale(2)',
        transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`,
      }
    : {
        transform: 'scale(1)',
        transformOrigin: '50% 50%',
      };

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={`group relative select-none overflow-hidden rounded-control border border-ink/10 bg-recessed touch-none ${aspectClass} ${
        dragging ? 'cursor-grabbing' : 'cursor-ew-resize'
      } ${className}`}
    >
      {/* After (Augmented) base layer */}
      <img
        src={afterSrc}
        alt={`${alt} — ${afterLabel}`}
        draggable={false}
        style={imageZoomStyle}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover transition-transform duration-150 ease-out"
      />

      {/* Before (Original) clipped overlay */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        <img
          src={beforeSrc}
          alt={`${alt} — ${beforeLabel}`}
          draggable={false}
          style={imageZoomStyle}
          className="h-full w-full object-cover transition-transform duration-150 ease-out"
        />
      </div>

      {/* Labels */}
      <span className="pointer-events-none absolute left-2.5 top-2.5 rounded-lg bg-ink/80 px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-surface backdrop-blur-sm">
        {beforeLabel}
      </span>
      <span className="pointer-events-none absolute right-2.5 top-2.5 rounded-lg bg-alpine-600/90 px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-surface backdrop-blur-sm">
        {afterLabel}
      </span>

      {/* Optional synchronized hover-zoom toggle */}
      {allowZoom && (
        <button
          type="button"
          data-zoom-toggle="true"
          onClick={(e) => {
            e.stopPropagation();
            setZoomEnabled((z) => !z);
          }}
          className={`absolute bottom-2.5 right-2.5 z-20 inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-mono text-[11px] font-medium shadow-sm backdrop-blur-sm transition-colors ${
            zoomEnabled
              ? 'border-alpine-600 bg-alpine-600 text-surface'
              : 'border-ink/15 bg-surface/90 text-ink hover:bg-surface'
          }`}
          aria-pressed={zoomEnabled}
          title={zoomEnabled ? 'Disable 2x hover zoom' : 'Enable 2x hover zoom'}
        >
          {zoomEnabled ? (
            <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <span>2×</span>
        </button>
      )}

      {/* Divider line & keyboard-accessible slider handle */}
      <div
        style={{ left: `${position}%` }}
        className="pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-surface shadow-[0_0_0_1px_rgba(2,116,179,0.35)]"
      >
        <div
          role="slider"
          tabIndex={0}
          aria-label={`Before and after split between ${beforeLabel} and ${afterLabel}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(position)}
          onKeyDown={handleKeyDown}
          className="pointer-events-auto absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-alpine-200 bg-surface text-alpine-700 shadow-elevated transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-alpine-600"
        >
          <MoveHorizontal className="h-4 w-4 text-alpine-700" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}