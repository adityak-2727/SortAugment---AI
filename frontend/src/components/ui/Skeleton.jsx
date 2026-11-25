export function SkeletonBox({ className = 'h-6 w-full' }) {
  return <div className={`sa-skeleton rounded-control ${className}`} aria-hidden="true" />;
}

export function SkeletonCardGrid({ count = 4, columnsClass = 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' }) {
  return (
    <div className={`grid gap-4 ${columnsClass}`} aria-busy="true" aria-label="Loading content">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="sa-card space-y-3 p-4">
          <div className="sa-skeleton aspect-[4/3] w-full rounded-control" />
          <div className="sa-skeleton h-4 w-2/3 rounded" />
          <div className="sa-skeleton h-3 w-1/2 rounded" />
        </div>
      ))}
    </div>
  );
}