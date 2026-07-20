import { useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, RefreshCw } from 'lucide-react';
import type { WorkoutHistoryEntry } from '~/lib/types';

interface WorkoutHistoryProps {
  history: WorkoutHistoryEntry[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  /** Cap the list (e.g. for the dashboard preview); omit to show everything. */
  limit?: number;
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Past completed workouts, newest first; tap an entry to expand its exercises. */
export function WorkoutHistory({ history, loading, error, onRetry, limit }: WorkoutHistoryProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-500" aria-label="Loading history" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card text-center">
        <p className="mb-3 text-sm text-red-500">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mx-auto flex items-center gap-2 rounded-xl bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="card py-8 text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No workouts logged yet. Complete your first workout to see it here.
        </p>
      </div>
    );
  }

  const entries = limit ? history.slice(0, limit) : history;

  return (
    <div className="space-y-3">
      {entries.map((entry) => {
        const expanded = expandedIds.has(entry.id);
        const totalExercises = entry.exercises.length + entry.cardioExercises.length;

        return (
          <article key={entry.id} className="card">
            <button
              type="button"
              onClick={() => toggleExpanded(entry.id)}
              aria-expanded={expanded}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <div>
                <h3 className="text-sm font-semibold">{formatDate(entry.date)}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {entry.completedSets}/{entry.totalSets} sets completed
                  {entry.totalCardioMinutes > 0 && ` · ${entry.totalCardioMinutes} min cardio`}
                  {entry.totalCardioMiles > 0 && ` · ${entry.totalCardioMiles} mi`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-slate-400 dark:text-slate-500">
                <span className="text-xs">
                  {totalExercises} exercise{totalExercises === 1 ? '' : 's'}
                </span>
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </button>

            {expanded && (
              <ul className="mt-3 space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700/60">
                {entry.exercises.map((workoutExercise, wi) => (
                  <li
                    key={`${entry.id}-${workoutExercise.exercise.id}-${wi}`}
                    className="flex items-baseline justify-between gap-2 text-sm"
                  >
                    <span className="font-medium">{workoutExercise.exercise.name}</span>
                    <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                      {workoutExercise.targetSets} × {workoutExercise.targetReps} ·{' '}
                      {workoutExercise.targetWeight ?? 0} lb
                      {workoutExercise.sets.some((set) => set.rir !== null) &&
                        ` · RIR ${workoutExercise.sets.find((set) => set.rir !== null)?.rir}`}
                    </span>
                  </li>
                ))}
                {entry.cardioExercises.map((cardioExercise, ci) => (
                  <li
                    key={`${entry.id}-${cardioExercise.equipment.id}-${ci}`}
                    className="flex items-baseline justify-between gap-2 text-sm"
                  >
                    <span className="font-medium">{cardioExercise.equipment.name}</span>
                    <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                      {cardioExercise.durationMinutes} min
                      {(cardioExercise.distanceMiles ?? 0) > 0 &&
                        ` · ${cardioExercise.distanceMiles} mi`}
                      {' · '}
                      {cardioExercise.equipment.category}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        );
      })}
    </div>
  );
}
