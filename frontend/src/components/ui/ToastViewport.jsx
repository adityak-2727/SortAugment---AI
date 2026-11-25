import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

const TONE_STYLES = {
  success: {
    icon: CheckCircle2,
    border: 'border-emeraldok-border',
    iconClass: 'text-emeraldok-text',
  },
  warning: {
    icon: AlertCircle,
    border: 'border-amberwarn-border',
    iconClass: 'text-amberwarn-text',
  },
  error: {
    icon: AlertCircle,
    border: 'border-err-border',
    iconClass: 'text-err-text',
  },
  info: {
    icon: Info,
    border: 'border-alpine-200',
    iconClass: 'text-alpine-600',
  },
};

export function ToastViewport() {
  const { toasts, dismissToast } = useToast();

  return (
    <div
      className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-full max-w-sm flex-col gap-2.5 px-4 sm:px-0"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const style = TONE_STYLES[toast.tone] || TONE_STYLES.info;
          const Icon = style.icon;
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className={`pointer-events-auto flex items-start gap-3 rounded-card border bg-surface/95 p-3.5 shadow-popover backdrop-blur-md ${style.border}`}
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.iconClass}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{toast.title}</p>
                {toast.description && (
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                    {toast.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="rounded-lg p-1 text-ink-subtle transition-colors hover:bg-recessed hover:text-ink"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}