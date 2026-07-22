import { useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays, format, parseISO } from 'date-fns';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Loader2, Pill, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { useSupplements } from '~/hooks/useSupplements';
import { useSupplementDay } from '~/hooks/useSupplementDay';
import { doseSummary } from '~/lib/supplements';
import type { UserSupplement } from '~/lib/types';
import { PageHeader } from '~/components/PageHeader';
import { ToggleRow } from '~/components/ToggleRow';

/**
 * Daily supplement logging: one instant-save switch per active supplement in
 * the user's list, for any past date up to today. Every save goes through the
 * set_supplement_taken RPC (no client dual-write); failures revert the switch
 * and offer a retry.
 */
export default function LogSupplements() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [date, setDate] = useState(today);
  const { supplements, loading: listLoading, error: listError, reload: reloadList } = useSupplements();
  const day = useSupplementDay(date);
  const [announce, setAnnounce] = useState('');

  const active = supplements.filter((s) => s.active);
  const isToday = date === today;
  const loading = listLoading || day.loading;

  function step(delta: number) {
    const next = format(addDays(parseISO(date), delta), 'yyyy-MM-dd');
    if (next > today) return;
    setAnnounce('');
    setDate(next);
  }

  async function handleToggle(supplement: UserSupplement, taken: boolean) {
    setAnnounce('');
    const ok = await day.toggle(supplement.id, taken);
    if (ok) setAnnounce('Saved');
  }

  return (
    <div>
      <div className="flex items-start justify-between">
        <PageHeader title="Log Supplements" backTo="/log" />
        <Link
          to="/settings/supplements"
          aria-label="Manage supplements"
          className="flex items-center gap-1.5 rounded-xl p-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          Manage
        </Link>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-700/60 dark:bg-slate-800">
        <button
          type="button"
          aria-label="Previous day"
          onClick={() => step(-1)}
          className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <p className="text-sm font-semibold">
          {isToday ? 'Today' : format(parseISO(date), 'EEEE, MMM d')}
        </p>
        <button
          type="button"
          aria-label="Next day"
          disabled={isToday}
          onClick={() => step(1)}
          className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-700"
        >
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {loading ? (
        <div className="space-y-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-16 animate-pulse" />
          ))}
        </div>
      ) : listError || day.error ? (
        <div className="card">
          <p className="mb-3 text-sm text-red-600 dark:text-red-400">
            {listError ?? day.error}
          </p>
          <button
            type="button"
            onClick={() => void (listError ? reloadList() : day.reload())}
            className="btn-primary"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Retry
          </button>
        </div>
      ) : active.length === 0 ? (
        <div className="card text-center">
          <Pill className="mx-auto mb-2 h-8 w-8 text-slate-400" aria-hidden />
          <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
            No supplements in your list yet.
          </p>
          <Link to="/settings/supplements" className="btn-primary">
            Set up supplements
          </Link>
        </div>
      ) : (
        <div className="mb-4 space-y-3">
          {active.map((supplement) => {
            const saving = day.savingIds.has(supplement.id);
            const itemError = day.errors.get(supplement.id);
            return (
              <div key={supplement.id}>
                <ToggleRow
                  label={supplement.name}
                  description={doseSummary(supplement) || undefined}
                  checked={day.takenIds.has(supplement.id)}
                  disabled={saving}
                  onChange={(taken) => void handleToggle(supplement, taken)}
                  icon={
                    saving ? (
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                    ) : (
                      <Pill className="h-5 w-5" aria-hidden />
                    )
                  }
                />
                {itemError && (
                  <div
                    role="alert"
                    className="mt-1 flex items-center justify-between gap-2 rounded-xl border border-red-300 bg-red-50 px-3 py-2 dark:border-red-500/40 dark:bg-red-900/20"
                  >
                    <span className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
                      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                      {supplement.name} not saved: {itemError.message}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleToggle(supplement, itemError.taken)}
                      className="flex shrink-0 items-center gap-1 rounded-lg bg-red-100 px-2.5 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60"
                    >
                      <RefreshCw className="h-3 w-3" aria-hidden />
                      Retry
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p
        role="status"
        aria-live="polite"
        className="flex items-center justify-end gap-1 text-xs text-slate-400 dark:text-slate-500"
      >
        {announce && (
          <>
            <Check className="h-3 w-3 text-emerald-500" aria-hidden />
            {announce}
          </>
        )}
      </p>
    </div>
  );
}
