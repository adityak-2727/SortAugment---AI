import { useAppData } from '../../context/AppDataContext';
import { getAxisStyle, getClassStyle } from '../../utils/classColors';
import { formatClassLabel } from '../../utils/formatters';

export function ClassChip({ label, size = 'sm', className = '' }) {
  const { classes } = useAppData();
  const style = getClassStyle(label, classes);
  const sizeClass =
    size === 'xs' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs';

  return (
    <span
      style={{
        backgroundColor: style.bg,
        color: style.text,
        borderColor: style.border,
      }}
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium leading-tight ${sizeClass} ${className}`}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: style.dot }}
        aria-hidden="true"
      />
      <span>{formatClassLabel(label)}</span>
    </span>
  );
}

export function AxisChip({ axis, size = 'sm', className = '' }) {
  const style = getAxisStyle(axis);
  const sizeClass =
    size === 'xs' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs';

  return (
    <span
      style={{
        backgroundColor: style.bg,
        color: style.text,
        borderColor: style.border,
      }}
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium leading-tight ${sizeClass} ${className}`}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: style.dot }}
        aria-hidden="true"
      />
      <span>{style.label}</span>
    </span>
  );
}