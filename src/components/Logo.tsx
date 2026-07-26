interface LogoProps {
  /** Mark size in pixels; the wordmark scales with the surrounding text size. */
  size?: number;
  /** Show the product name beside the mark. */
  withWordmark?: boolean;
  className?: string;
}

/**
 * App identity. The mark matches the installed PWA icon exactly — a dumbbell
 * in emerald on the slate app surface — so the home-screen tile, login screen,
 * and sidebar all read as the same product.
 */
export function Logo({ size = 32, withWordmark = false, className = '' }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        role="img"
        aria-label="Fitness Activity Coach"
        className="shrink-0"
      >
        <rect width="48" height="48" rx="11" className="fill-slate-900 dark:fill-slate-800" />
        <g className="fill-emerald-500">
          <rect x="17" y="21.6" width="14" height="4.8" rx="2.4" />
          <rect x="12.4" y="16.4" width="5.2" height="15.2" rx="2.4" />
          <rect x="30.4" y="16.4" width="5.2" height="15.2" rx="2.4" />
          <rect x="7.4" y="19.2" width="4.2" height="9.6" rx="2.1" />
          <rect x="36.4" y="19.2" width="4.2" height="9.6" rx="2.1" />
        </g>
      </svg>
      {withWordmark && (
        <span className="font-semibold tracking-tight">
          Fitness <span className="text-emerald-500">Coach</span>
        </span>
      )}
    </span>
  );
}
