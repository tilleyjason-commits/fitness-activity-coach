interface SkeletonProps {
  /** Tailwind sizing/shape classes for this bar. */
  className?: string;
}

/**
 * One placeholder bar. Skeletons mirror the shape of the content that will
 * replace them, so the layout does not jump once data lands — a grey block of
 * arbitrary height moves everything below it on arrival.
 */
export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <span
      aria-hidden
      className={`block animate-pulse rounded-md bg-slate-200 dark:bg-slate-700 ${className}`}
    />
  );
}

interface SkeletonCardProps {
  /** Accessible description of what is loading. */
  label: string;
  /** Widths for the stacked lines, as Tailwind width classes. */
  lines?: string[];
  className?: string;
}

/** Card-shaped loading state with a live-region label for screen readers. */
export function SkeletonCard({
  label,
  lines = ['w-2/3', 'w-1/2'],
  className = '',
}: SkeletonCardProps) {
  return (
    <div className={`card ${className}`} role="status" aria-live="polite" aria-label={label}>
      <span className="sr-only">{label}</span>
      <span className="block space-y-2.5">
        {lines.map((width, index) => (
          <Skeleton key={index} className={`h-3.5 ${width}`} />
        ))}
      </span>
    </div>
  );
}

/** Stat-block skeleton: a short caption bar above a tall figure bar. */
export function SkeletonStat() {
  return (
    <span className="block space-y-2">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-7 w-24" />
    </span>
  );
}
