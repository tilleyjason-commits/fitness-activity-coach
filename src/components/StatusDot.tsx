import { Check, X } from 'lucide-react';

export type DotStatus = 'pass' | 'fail' | 'pending';

const STATUS_TEXT: Record<DotStatus, string> = {
  pass: 'done',
  fail: 'missed',
  pending: 'not logged yet',
};

interface StatusDotProps {
  status: DotStatus;
  /** Optional caption under the dot (compliance row on the dashboard). */
  label?: string;
}

/**
 * Compliance status with shape redundancy so it survives color blindness:
 * pass = filled green check, fail = filled red ×, pending = hollow gray ring.
 */
export function StatusDot({ status, label }: StatusDotProps) {
  const ariaLabel = label ? `${label}: ${STATUS_TEXT[status]}` : STATUS_TEXT[status];
  const dot =
    status === 'pass' ? (
      <span
        role="img"
        aria-label={ariaLabel}
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"
      >
        <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
      </span>
    ) : status === 'fail' ? (
      <span
        role="img"
        aria-label={ariaLabel}
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-500 text-white"
      >
        <X className="h-3 w-3" strokeWidth={3} aria-hidden />
      </span>
    ) : (
      <span
        role="img"
        aria-label={ariaLabel}
        className="inline-block h-4 w-4 shrink-0 rounded-full border-2 border-slate-300 dark:border-slate-600"
      />
    );

  if (!label) return dot;

  return (
    <div className="flex flex-col items-center gap-1.5">
      {dot}
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
    </div>
  );
}
