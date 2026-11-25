import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ToastContext = createContext(null);

let toastSeq = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const addToast = useCallback(
    ({ title, description = '', tone = 'info', durationMs = 4500 }) => {
      const id = `toast_${toastSeq++}`;
      setToasts((prev) => [...prev.slice(-3), { id, title, description, tone }]);
      if (durationMs > 0) {
        window.setTimeout(() => {
          dismissToast(id);
        }, durationMs);
      }
      return id;
    },
    [dismissToast]
  );

  const value = useMemo(
    () => ({ toasts, addToast, dismissToast }),
    [toasts, addToast, dismissToast]
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}