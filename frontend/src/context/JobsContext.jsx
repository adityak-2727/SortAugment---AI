import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { cancelJob, getJob, listJobs } from '../api/client';
import { useToast } from './ToastContext';

const JobsContext = createContext(null);
const TERMINAL_STATUSES = new Set(['done', 'failed', 'cancelled']);

export function JobsProvider({ children }) {
  const { addToast } = useToast();

  const [recentJobs, setRecentJobs] = useState([]);
  const [recentLoading, setRecentLoading] = useState(true);

  const [activeJobId, setActiveJobId] = useState(null);
  const [activeJobType, setActiveJobType] = useState(null);
  const [activeJob, setActiveJob] = useState(null);
  const [polling, setPolling] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [activeError, setActiveError] = useState(null);
  const [lastCompletedJob, setLastCompletedJob] = useState(null);

  const timerRef = useRef(null);
  const activeIdRef = useRef(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const refreshRecentJobs = useCallback(async () => {
    setRecentLoading(true);
    try {
      const res = await listJobs();
      setRecentJobs(res?.jobs || []);
    } catch {
      // Keep previous list if offline/error
    } finally {
      setRecentLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshRecentJobs();
  }, [refreshRecentJobs]);

  const pollOnce = useCallback(
    async (id) => {
      if (!id || activeIdRef.current !== id) return;
      try {
        const data = await getJob(id);
        if (activeIdRef.current !== id) return;

        setActiveJob(data);
        setActiveJobType(data.type || null);
        setActiveError(data.status === 'failed' ? data.error || 'Job failed.' : null);

        if (TERMINAL_STATUSES.has(data.status)) {
          setPolling(false);
          stopTimer();
          refreshRecentJobs();

          if (data.status === 'done') {
            setLastCompletedJob(data);
            const totalVariants = (data?.result?.sources || []).reduce(
              (acc, s) => acc + (s.variants?.length || 0),
              0
            );
            addToast({
              title: data.type === 'generate' ? 'Live generation complete' : 'Augmentation complete',
              description: `Job ${data.job_id} finished with ${totalVariants} variant${
                totalVariants === 1 ? '' : 's'
              }.`,
              tone: 'success',
            });
          } else if (data.status === 'failed') {
            addToast({
              title: 'Job failed',
              description: data.error || `Job ${data.job_id} stopped with an error.`,
              tone: 'error',
            });
          } else if (data.status === 'cancelled') {
            addToast({
              title: 'Job cancelled',
              description: `Job ${data.job_id} was stopped.`,
              tone: 'warning',
            });
          }
          return;
        }

        timerRef.current = window.setTimeout(() => pollOnce(id), 600);
      } catch (err) {
        if (activeIdRef.current !== id) return;
        const message = err?.message || 'Failed to poll job status.';
        setActiveError(message);
        setPolling(false);
        stopTimer();
        addToast({ title: 'Job status error', description: message, tone: 'error' });
      }
    },
    [addToast, refreshRecentJobs, stopTimer]
  );

  const trackJob = useCallback(
    (jobId, typeHint = 'augment') => {
      if (!jobId) return;
      stopTimer();
      activeIdRef.current = jobId;
      setActiveJobId(jobId);
      setActiveJobType(typeHint);
      setActiveJob(null);
      setActiveError(null);
      setCancelling(false);
      setPolling(true);
      pollOnce(jobId);
    },
    [pollOnce, stopTimer]
  );

  const cancelActiveJob = useCallback(async () => {
    const id = activeIdRef.current;
    if (!id) return;
    setCancelling(true);
    try {
      await cancelJob(id);
      const latest = await getJob(id);
      setActiveJob(latest);
      setPolling(false);
      stopTimer();
      refreshRecentJobs();
    } catch (err) {
      setActiveError(err?.message || 'Failed to cancel job.');
    } finally {
      setCancelling(false);
    }
  }, [refreshRecentJobs, stopTimer]);

  const dismissCompletedNotice = useCallback(() => {
    setLastCompletedJob(null);
  }, []);

  const clearActiveJob = useCallback(() => {
    stopTimer();
    activeIdRef.current = null;
    setActiveJobId(null);
    setActiveJobType(null);
    setActiveJob(null);
    setPolling(false);
    setCancelling(false);
    setActiveError(null);
  }, [stopTimer]);

  useEffect(() => () => stopTimer(), [stopTimer]);

  const value = useMemo(
    () => ({
      recentJobs,
      recentLoading,
      refreshRecentJobs,
      activeJobId,
      activeJobType,
      activeJob,
      polling,
      cancelling,
      activeError,
      lastCompletedJob,
      trackJob,
      cancelActiveJob,
      clearActiveJob,
      dismissCompletedNotice,
    }),
    [
      recentJobs,
      recentLoading,
      refreshRecentJobs,
      activeJobId,
      activeJobType,
      activeJob,
      polling,
      cancelling,
      activeError,
      lastCompletedJob,
      trackJob,
      cancelActiveJob,
      clearActiveJob,
      dismissCompletedNotice,
    ]
  );

  return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>;
}

export function useJobs() {
  const ctx = useContext(JobsContext);
  if (!ctx) {
    throw new Error('useJobs must be used within a JobsProvider');
  }
  return ctx;
}