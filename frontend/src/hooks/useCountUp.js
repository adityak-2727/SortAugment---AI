import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * Smoothly animates a numeric value from 0 to `target` using requestAnimationFrame.
 * Respects prefers-reduced-motion and returns null unchanged for missing values.
 */
export function useCountUp(target, { durationMs = 700, enabled = true } = {}) {
  const prefersReducedMotion = useReducedMotion();
  const isNumeric = target !== null && target !== undefined && !Number.isNaN(Number(target));
  const numericTarget = isNumeric ? Number(target) : null;

  const [displayValue, setDisplayValue] = useState(() =>
    prefersReducedMotion || !enabled ? numericTarget : numericTarget === null ? null : 0
  );

  useEffect(() => {
    if (numericTarget === null) {
      setDisplayValue(null);
      return undefined;
    }

    if (prefersReducedMotion || !enabled) {
      setDisplayValue(numericTarget);
      return undefined;
    }

    let rafId = 0;
    const startTime = performance.now();

    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(numericTarget * eased);
      if (progress < 1) {
        rafId = window.requestAnimationFrame(step);
      } else {
        setDisplayValue(numericTarget);
      }
    };

    rafId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(rafId);
  }, [numericTarget, durationMs, enabled, prefersReducedMotion]);

  return displayValue;
}