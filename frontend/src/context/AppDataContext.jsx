import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getEffects, getHealth, USE_MOCK, API_BASE_URL } from '../api/client';

const AppDataContext = createContext(null);

export function AppDataProvider({ children }) {
  const [health, setHealth] = useState(null);
  const [effectsData, setEffectsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthRes, effectsRes] = await Promise.all([getHealth(), getEffects()]);
      setHealth(healthRes);
      setEffectsData(effectsRes);
    } catch (err) {
      setError(err?.message || 'Failed to initialize application metadata.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      health,
      classes: health?.classes || [],
      axes: effectsData?.axes || [],
      gpu: health?.gpu || null,
      liveGeneration: health?.live_generation || null,
      modelLoaded: Boolean(health?.model_loaded),
      loading,
      error,
      isMock: USE_MOCK,
      apiBaseUrl: API_BASE_URL,
      refresh,
    }),
    [health, effectsData, loading, error, refresh]
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) {
    throw new Error('useAppData must be used within an AppDataProvider');
  }
  return ctx;
}