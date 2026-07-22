import { useState } from 'react';
import { Check, Dumbbell, Minus, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { CardioWorkoutExercise, WorkoutExercise } from '~/lib/types';

interface WorkoutTrackerProps {
  exercises: WorkoutExercise[];
  cardioExercises: CardioWorkoutExercise[];
  onLogSet: (exIdx: number, setIdx: number, reps: number, weight: number, rir: number | null) => void;
  onRemoveExercise: (exIdx: number) => void;
  onRemoveCardioExercise: (cardioIdx: number) => void;
}

interface ActiveSet {
  exIdx: number;
  setIdx: number;
}

/**
 * Live set-by-set logger for the active workout. One tap on a set tile
 * quick-completes it with its target/current values (and starts rest via the
 * parent's onLogSet path); the explicit edit control opens the logger sheet.
 */
export function WorkoutTracker({
  exercises,
  cardioExercises,
  onLogSet,
  onRemoveExercise,
  onRemoveCardioExercise,
}: WorkoutTrackerProps) {
  const [activeSet, setActiveSet] = useState<ActiveSet | null>(null);
  const [reps, setReps] = useState(10);
  const [weight, setWeight] = useState(50);
  const [rir, setRir] = useState(2);

  function openSetLogger(exIdx: number, setIdx: number) {
    const set = exercises[exIdx].sets[setIdx];
    setActiveSet({ exIdx, setIdx });
    setReps(set.reps);
    setWeight(set.weight);
    setRir(set.rir ?? 2);
  }

  function handleLogSet() {
    if (!activeSet) return;
    onLogSet(activeSet.exIdx, activeSet.setIdx, reps, weight, rir);
    setActiveSet(null);
  }

  if (exercises.length === 0 && cardioExercises.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-2 py-8 text-center">
        <Dumbbell className="h-8 w-8 text-slate-400 dark:text-slate-500" aria-hidden />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No exercises yet. Add strength or cardio above to get started.
        </p>
      </div>
    );
  }

  const activeExercise = activeSet ? exercises[activeSet.exIdx] : null;

  return (
    <div className="space-y-3">
      {exercises.map((we, exIdx) => {
        const completedCount = we.sets.filter((s) => s.completed).length;
        const allDone = completedCount === we.sets.length && we.sets.length > 0;

        return (
          <div
            key={`${we.exercise.id}-${exIdx}`}
            className={`card ${allDone ? 'border-emerald-500/60 dark:border-emerald-500/50' : ''}`}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  {exIdx + 1}
                </span>
                <div>
                  <p className="text-sm font-semibold">{we.exercise.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {we.exercise.muscleGroup} · {we.targetSets} × {we.targetReps} ·{' '}
                    {we.targetWeight ?? 0} lb
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`text-xs font-semibold tabular-nums ${
                    allDone
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {completedCount}/{we.sets.length}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveExercise(exIdx)}
                  aria-label={`Remove ${we.exercise.name}`}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {we.sets.map((set, setIdx) => {
                return (
                  <div
                    key={setIdx}
                    className={`flex items-stretch overflow-hidden rounded-xl border transition-colors ${
                      set.completed
                        ? 'border-emerald-500 bg-emerald-50 dark:border-emerald-500/60 dark:bg-emerald-500/10'
                        : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        set.completed
                          ? openSetLogger(exIdx, setIdx)
                          : onLogSet(exIdx, setIdx, set.reps, set.weight, set.rir)
                      }
                      aria-label={
                        set.completed
                          ? `Set ${setIdx + 1} completed — edit`
                          : `Complete set ${setIdx + 1}: ${set.reps} reps × ${set.weight} lb`
                      }
                      className="min-h-11 min-w-0 flex-1 px-2.5 py-2 text-left"
                    >
                      <span className="flex items-center gap-1 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                        Set {setIdx + 1}
                        {set.completed && <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden />}
                      </span>
                      <span className="block text-xs font-semibold tabular-nums">
                        {set.reps} × {set.weight} lb
                      </span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">
                        RIR {set.rir ?? '—'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openSetLogger(exIdx, setIdx)}
                      aria-label={`Edit set ${setIdx + 1}`}
                      className="flex min-h-11 min-w-11 shrink-0 items-center justify-center border-l border-slate-200 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700/60 dark:hover:text-slate-200"
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {cardioExercises.map((cardioExercise, cardioIdx) => (
        <div key={`${cardioExercise.equipment.id}-${cardioIdx}`} className="card">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-xs font-bold text-sky-600 dark:text-sky-400">
                {exercises.length + cardioIdx + 1}
              </span>
              <div>
                <p className="text-sm font-semibold">{cardioExercise.equipment.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {cardioExercise.equipment.category} · {cardioExercise.durationMinutes} min
                  {(cardioExercise.distanceMiles ?? 0) > 0 && ` · ${cardioExercise.distanceMiles} mi`}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs font-semibold text-sky-600 dark:text-sky-400">Cardio</span>
              <button
                type="button"
                onClick={() => onRemoveCardioExercise(cardioIdx)}
                aria-label={`Remove ${cardioExercise.equipment.name}`}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-500"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ))}

      {activeSet && activeExercise && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 px-4 pb-24"
          role="dialog"
          aria-label="Log set"
        >
          <div className="card w-full max-w-md shadow-xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                  Log Set {activeSet.setIdx + 1}
                </p>
                <h3 className="text-base font-bold">{activeExercise.exercise.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveSet(null)}
                aria-label="Close"
                className="-m-2 flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-2">
              <div>
                <span className="label text-xs">Reps</span>
                <div className="flex items-center justify-between rounded-xl border border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900">
                  <button
                    type="button"
                    aria-label="Decrease reps"
                    onClick={() => setReps((v) => Math.max(0, v - 1))}
                    className="flex min-h-11 min-w-11 items-center justify-center text-slate-500 transition-colors hover:text-emerald-500 dark:text-slate-400"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="text-sm font-semibold tabular-nums">{reps}</span>
                  <button
                    type="button"
                    aria-label="Increase reps"
                    onClick={() => setReps((v) => Math.min(100, v + 1))}
                    className="flex min-h-11 min-w-11 items-center justify-center text-slate-500 transition-colors hover:text-emerald-500 dark:text-slate-400"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="log-set-weight" className="label text-xs">
                  Weight (lb)
                </label>
                <input
                  id="log-set-weight"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={999}
                  value={weight}
                  onChange={(e) => setWeight(Math.min(999, Math.max(0, Number(e.target.value) || 0)))}
                  className="field px-2 py-2 text-sm"
                />
              </div>
              <div>
                <span className="label text-xs">RIR</span>
                <div className="flex items-center justify-between rounded-xl border border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900">
                  <button
                    type="button"
                    aria-label="Decrease RIR"
                    onClick={() => setRir((v) => Math.max(0, v - 1))}
                    className="flex min-h-11 min-w-11 items-center justify-center text-slate-500 transition-colors hover:text-emerald-500 dark:text-slate-400"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="text-sm font-semibold tabular-nums">{rir}</span>
                  <button
                    type="button"
                    aria-label="Increase RIR"
                    onClick={() => setRir((v) => Math.min(10, v + 1))}
                    className="flex min-h-11 min-w-11 items-center justify-center text-slate-500 transition-colors hover:text-emerald-500 dark:text-slate-400"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            <button type="button" onClick={handleLogSet} className="btn-primary">
              <Check className="h-4 w-4" aria-hidden />
              Log Set
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
