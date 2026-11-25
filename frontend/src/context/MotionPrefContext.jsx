import { createContext, useContext, useMemo, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

const MotionPrefContext = createContext(null);

export function MotionPrefProvider({ children }) {
  const prefersReducedMotion = useReducedMotion();
  const [tiltEnabled, setTiltEnabled] = useState(true);

  const value = useMemo(
    () => ({
      tiltEnabled: Boolean(tiltEnabled && !prefersReducedMotion),
      rawTiltPreference: tiltEnabled,
      prefersReducedMotion: Boolean(prefersReducedMotion),
      setTiltEnabled,
      toggleTilt: () => setTiltEnabled((v) => !v),
    }),
    [tiltEnabled, prefersReducedMotion]
  );

  return <MotionPrefContext.Provider value={value}>{children}</MotionPrefContext.Provider>;
}

export function useMotionPref() {
  const ctx = useContext(MotionPrefContext);
  if (!ctx) {
    throw new Error('useMotionPref must be used within a MotionPrefProvider');
  }
  return ctx;
}