import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';

export function StatePanel({
  variant = 'empty',
  title,
  description,
  icon: CustomIcon = null,
  actionLabel = null,
  onAction = null,
  secondaryAction = null,
  className = '',
}) {
  const isError = variant === 'error';
  const Icon = CustomIcon || (isError ? AlertTriangle : Inbox);

  return (
    <div
      className={`flex flex-col items-center justify-center rounded-panel border px-6 py-12 text-center ${
        isError
          ? 'border-err-border bg-err-bg/60'
          : 'border-dashed border-ink/15 bg-surface/80'
      } ${className}`}
      role={isError ? 'alert' : 'status'}
    >
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-control border ${
          isError
            ? 'border-err-border bg-surface text-err-text'
            : 'border-ink/10 bg-paper text-ink-muted'
        }`}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <h3 className="mt-4 font-display text-base font-semibold text-ink">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-muted">{description}</p>
      )}
      {(actionLabel || secondaryAction) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          {actionLabel && onAction && (
            <button
              type="button"
              onClick={onAction}
              className={isError ? 'sa-btn-secondary' : 'sa-btn-primary'}
            >
              {isError && <RefreshCw className="h-4 w-4" aria-hidden="true" />}
              {actionLabel}
            </button>
          )}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}