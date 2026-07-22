import { Link } from 'react-router-dom';

export type TrainingTab = 'workout' | 'history' | 'routines';

interface TrainingTabsProps {
  active: TrainingTab;
  /**
   * Present on /training, where Workout/History switch in-page state.
   * Omitted on /routines, where they navigate back to /training instead.
   */
  onSelect?: (tab: 'workout' | 'history') => void;
}

const BASE =
  'flex min-h-11 items-center justify-center rounded-lg py-2 text-center text-sm font-medium transition-colors';
// Selection is a neutral filled chip (see index.css color roles): emerald is
// reserved for actions and pass/success, so "selected" never reads as "done".
const ACTIVE = 'bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-900';
const INACTIVE =
  'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200';

/** Shared Workout / History / Routines segment control — the tabs are the navigation. */
export function TrainingTabs({ active, onSelect }: TrainingTabsProps) {
  function tabClass(tab: TrainingTab) {
    return `${BASE} ${active === tab ? ACTIVE : INACTIVE}`;
  }

  return (
    <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700/60 dark:bg-slate-800">
      {onSelect ? (
        <button
          type="button"
          onClick={() => onSelect('workout')}
          className={tabClass('workout')}
          aria-pressed={active === 'workout'}
        >
          Workout
        </button>
      ) : (
        <Link to="/training" className={tabClass('workout')}>
          Workout
        </Link>
      )}
      {onSelect ? (
        <button
          type="button"
          onClick={() => onSelect('history')}
          className={tabClass('history')}
          aria-pressed={active === 'history'}
        >
          History
        </button>
      ) : (
        <Link to="/training?tab=history" className={tabClass('history')}>
          History
        </Link>
      )}
      {active === 'routines' ? (
        <span className={tabClass('routines')} aria-current="page">
          Routines
        </span>
      ) : (
        <Link to="/routines" className={tabClass('routines')}>
          Routines
        </Link>
      )}
    </div>
  );
}
