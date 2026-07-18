export type DotStatus = 'pass' | 'fail' | 'pending';

const DOT_CLASSES: Record<DotStatus, string> = {
  pass: 'bg-emerald-500',
  fail: 'bg-red-500',
  pending: 'bg-slate-300 dark:bg-slate-600',
};

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

/** Green (done/passed), red (failed), gray (not yet logged) compliance dot. */
export function StatusDot({ status, label }: StatusDotProps) {
  const dot = (
    <span
      className={`inline-block h-3.5 w-3.5 shrink-0 rounded-full ${DOT_CLASSES[status]}`}
      role="img"
      aria-label={label ? `${label}: ${STATUS_TEXT[status]}` : STATUS_TEXT[status]}
    />
  );

  if (!label) return dot;

  return (
    <div className="flex flex-col items-center gap-1.5">
      {dot}
      <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{label}</span>
    </div>
  );
}
