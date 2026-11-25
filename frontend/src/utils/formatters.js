export function formatPercent(fraction, decimals = 1) {
  if (fraction === null || fraction === undefined || Number.isNaN(Number(fraction))) {
    return 'n/a';
  }
  return `${(Number(fraction) * 100).toFixed(decimals)}%`;
}

export function formatScore(value, decimals = 3) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return Number(value).toFixed(decimals);
}

export function formatEta(seconds) {
  if (seconds === null || seconds === undefined || seconds < 0) {
    return 'Estimating…';
  }
  const rounded = Math.ceil(seconds);
  if (rounded < 60) {
    return `${rounded}s left`;
  }
  const mins = Math.floor(rounded / 60);
  const rem = rounded % 60;
  return `${mins}m ${rem}s left`;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatTimestamp(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatEffectName(effectId) {
  if (!effectId) return '';
  return effectId
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatClassLabel(name) {
  if (!name) return 'Unlabeled';
  return name.charAt(0).toUpperCase() + name.slice(1);
}