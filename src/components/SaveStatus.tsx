import { AlertTriangle, Check, Loader2, RefreshCw } from 'lucide-react';
import type { AutosaveState } from '~/lib/autosave';

interface SaveStatusProps {
  state: AutosaveState;
  onRetry: () => void;
}

/**
 * Autosave indicator for the active workout: pending → saving → saved in one
 * stable live region (no remount flicker), and a retryable alert on error.
 * It never claims "Saved" unless the controller actually confirmed the save.
 */
export function SaveStatus({ state, onRetry }: SaveStatusProps) {
  if (state.status === 'idle') return null;

  if (state.status === 'error') {
    return (
      <div
        role="alert"
        className="flex items-center justify-between gap-2 rounded-xl border border-red-300 bg-red-50 px-3 py-2 dark:border-red-500/40 dark:bg-red-900/20"
      >
        <span className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          Workout not saved: {state.error ?? 'unknown error'}
        </span>
        <button
          type="button"
          onClick={onRetry}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-red-100 px-2.5 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60"
        >
          <RefreshCw className="h-3 w-3" aria-hidden />
          Retry
        </button>
      </div>
    );
  }

  return (
    <p
      role="status"
      aria-live="polite"
      className="flex items-center justify-end gap-1 text-xs text-slate-400 dark:text-slate-500"
    >
      {state.status === 'saving' ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          Saving…
        </>
      ) : state.status === 'pending' ? (
        'Unsaved changes'
      ) : (
        <>
          <Check className="h-3 w-3 text-emerald-500" aria-hidden />
          Saved
        </>
      )}
    </p>
  );
}
