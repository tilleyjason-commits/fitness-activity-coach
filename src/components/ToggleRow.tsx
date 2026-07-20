import type { ReactNode } from 'react';

interface ToggleRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon?: ReactNode;
  /** Blocks interaction while a save for this row is in flight. */
  disabled?: boolean;
}

/** Full-width labeled switch row (whole row is the tap target). */
export function ToggleRow({ label, description, checked, onChange, icon, disabled }: ToggleRowProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="card flex w-full items-center gap-3 text-left disabled:opacity-60"
    >
      {icon && <span className="shrink-0 text-slate-400 dark:text-slate-500">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        {description && (
          <span className="block text-xs text-slate-500 dark:text-slate-400">{description}</span>
        )}
      </span>
      <span
        aria-hidden
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            checked ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  );
}
