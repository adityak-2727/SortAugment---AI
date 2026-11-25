import { useCallback, useEffect, useRef, useState } from 'react';
import { cancelJob, getJob } from '../api/client';

const TERMINAL_STATUSES = new Set(['done', 'failed', 'cancelled']);

export function useJobPoller({ intervalMs = 600, onComplete, onError } = {}) {
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const [polling, setPolling] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState(null);

  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  onCompleteRef.current = onComplete;
  onErrorRef.current = onError;

  const timerRef = useRef(null);
  const activeIdRef = useRef(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const pollOnce = useCallback(
    async (id) => {
      if (!id || activeIdRef.current !== id) return;
      try {
        const data = await getJob(id);
        if (activeIdRef.current !== id) return;
        setJob(data);
        setError(data.status === 'failed' ? data.error || 'Job failed.' : null);

        if (TERMINAL_STATUSES.has(data.status)) {
          setPolling(false);
          stopTimer();
          if (data.status === 'done' && onCompleteRef.current) {
            onCompleteRef.current(data);
          } else if (data.status === 'failed' && onErrorRef.current) {
            onErrorRef.current(data.error || 'Job failed.');
          }
          return;
        }

        timerRef.current = window.setTimeout(() => pollOnce(id), intervalMs);
      } catch (err) {
        if (activeIdRef.current !== id) return;
        const message = err?.message || 'Failed to poll job status.';
        setError(message);
        setPolling(false);
        stopTimer();
        if (onErrorRef.current) {
          onErrorRef.current(message);
        }
      }
    },
    [intervalMs, stopTimer]
  );

  const startPolling = useCallback(
    (id) => {
      stopTimer();
      activeIdRef.current = id;
      setJobId(id);
      setJob(null);
      setError(null);
      setCancelling(false);
      setPolling(true);
      pollOnce(id);
    },
    [pollOnce, stopTimer]
  );

  const cancel = useCallback(async () => {
    const id = activeIdRef.current;
    if (!id) return;
    setCancelling(true);
    try {
      await cancelJob(id);
      const latest = await getJob(id);
      setJob(latest);
      setPolling(false);
      stopTimer();
    } catch (err) {
      setError(err?.message || 'Failed to cancel job.');
    } finally {
      setCancelling(false);
    }
  }, [stopTimer]);

  const reset = useCallback(() => {
    stopTimer();
    activeIdRef.current = null;
    setJobId(null);
    setJob(null);
    setPolling(false);
    setCancelling(false);
    setError(null);
  }, [stopTimer]);

  useEffect(() => () => stopTimer(), [stopTimer]);

  return {
    jobId,
    job,
    polling,
    cancelling,
    error,
    startPolling,
    cancel,
    reset,
  };
}