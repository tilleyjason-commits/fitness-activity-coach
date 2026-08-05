import { useState } from 'react';
import { Check, ChevronDown, Dumbbell, History, Minus, Plus, TrendingUp, Trash2, X } from 'lucide-react';
import type { CardioWorkoutExercise, WorkoutExercise } from '~/lib/types';
import { pastSetForIndex, suggestNextSet, type PastSet } from '~/lib/workout-mappers';

interface WorkoutTrackerProps {
  exercises: WorkoutExercise[];
  cardioExercises: CardioWorkoutExercise[];
  onLogSet: (exIdx: number, setIdx: number, reps: number, weight: number, rir: number | null) => void;
  /** Adjust reps-in-reserve alone, without completing the set. */
  onSetRir?: (exIdx: number, setIdx: number, rir: number | null) => void;
  onRemoveExercise: (exIdx: number) => void;
  onRemoveCardioExercise: (cardioIdx: number) => void;
  /** Completed sets from the last session that logged each exercise, by exercise id. */
  pastByExerciseId?: Record<string, PastSet[]>;
}

interface ActiveSet {
  exIdx: number;
  setIdx: number;
}

/** RIR lands here on the first stepper tap — the same default the sheet uses. */
const DEFAULT_RIR = 2;

const MAX_RIR = 10;

function stepRir(current: number | null, delta: number): number {
  if (current === null) return DEFAULT_RIR;
  return Math.min(MAX_RIR, Math.max(0, current + delta));
}

function describePastSet(past: PastSet): string {
  const rir = past.rir === null ? '' : ` · RIR ${past.rir}`;
  return `${past.reps} × ${past.weight} lb${rir}`;
}

/**
 * Live set-by-set logger for the active workout. Each set is a full-width row:
 * the reps × weight figure opens the editor sheet, and RIR carries its own
 * always-visible stepper because reps-in-reserve is judged per set as it ends.
 * Fully completed exercises collapse to a summary line so the set being worked
 * is the only expanded card.
 */
export function WorkoutTracker({
  exercises,
  cardioExercises,
  onLogSet,
  onSetRir,
  onRemoveExercise,
  onRemoveCardioExercise,
  pastByExerciseId,
}: WorkoutTrackerProps) {
  const [activeSet, setActiveSet] = useState<ActiveSet | null>(null);
  const [reps, setReps] = useState(10);
  const [weight, setWeight] = useState(50);
  const [rir, setRir] = useState(2);
  const [expandedDone, setExpandedDone] = useState<Set<string>>(new Set());

  function toggleExpanded(key: string) {
    setExpandedDone((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function openSetLogger(exIdx: number, setIdx: number) {
    const set = exercises[exIdx].sets[setIdx];
    setActiveSet({ exIdx, setIdx });
    setReps(set.reps);
    setWeight(set.weight);
    setRir(set.rir ?? DEFAULT_RIR);
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
  const activeReference =
    activeSet && activeExercise
      ? pastSetForIndex(pastByExerciseId?.[activeExercise.exercise.id] ?? null, activeSet.setIdx)
      : null;
  const overloadSuggestion = suggestNextSet(activeReference);

  return (
    <div className="space-y-3">
      {exercises.map((we, exIdx) => {
        const key = `${we.exercise.id}-${exIdx}`;
        const completedCount = we.sets.filter((s) => s.completed).length;
        const allDone = completedCount === we.sets.length && we.sets.length > 0;
        const collapsed = allDone && !expandedDone.has(key);
        const nextSetIdx = we.sets.findIndex((s) => !s.completed);
        const past = pastByExerciseId?.[we.exercise.id] ?? null;
        const reference = pastSetForIndex(past, nextSetIdx === -1 ? we.sets.length - 1 : nextSetIdx);

        if (collapsed) {
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggleExpanded(key)}
              aria-expanded={false}
              className="card flex min-h-11 w-full items-center justify-between gap-2 border-emerald-500/40 py-3 text-left opacity-70 transition-opacity hover:opacity-100 dark:border-emerald-500/30"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <Check className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                <span className="truncate text-sm font-medium">{we.exercise.name}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                {we.sets.length} × {we.sets[0]?.reps ?? we.targetReps} · {we.sets[0]?.weight ?? we.targetWeight} lb
                <ChevronDown className="h-4 w-4" aria-hidden />
              </span>
            </button>
          );
        }

        return (
          <div
            key={key}
            className={`card ${allDone ? 'border-emerald-500/60 dark:border-emerald-500/50' : ''}`}
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  {exIdx + 1}
                </span>
                <div className="min-w-0">
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
                {allDone && (
                  <button
                    type="button"
                    onClick={() => toggleExpanded(key)}
                    aria-label={`Collapse ${we.exercise.name}`}
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700/60 dark:hover:text-slate-200"
                  >
                    <ChevronDown className="h-4 w-4 rotate-180" aria-hidden />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onRemoveExercise(exIdx)}
                  aria-label={`Remove ${we.exercise.name}`}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>

            {reference && (
              <p className="mb-2.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <History className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Last time: {describePastSet(reference)}
              </p>
            )}

            <div className="space-y-2">
              {we.sets.map((set, setIdx) => (
                <div
                  key={setIdx}
                  className={`flex items-center gap-2 rounded-xl border px-2 py-1 transition-colors ${
                    set.completed
                      ? 'border-emerald-500 bg-emerald-50 dark:border-emerald-500/60 dark:bg-emerald-500/10'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <span className="w-9 shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Set {setIdx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => openSetLogger(exIdx, setIdx)}
                    aria-label={
                      set.completed
                        ? `Set ${setIdx + 1} completed — edit ${set.reps} reps at ${set.weight} lb`
                        : `Edit set ${setIdx + 1}`
                    }
                    className="flex min-h-11 min-w-11 flex-1 items-center text-left text-base font-semibold tabular-nums"
                  >
                    {set.reps} × {set.weight} lb
                  </button>
                  <div className="flex shrink-0 items-center rounded-lg bg-slate-100 dark:bg-slate-900">
                    <button
                      type="button"
                      onClick={() => onSetRir?.(exIdx, setIdx, stepRir(set.rir, -1))}
                      disabled={!onSetRir}
                      aria-label={`Decrease RIR for set ${setIdx + 1}`}
                      className="flex min-h-11 w-9 items-center justify-center rounded-l-lg text-slate-500 transition-colors hover:text-emerald-500 disabled:opacity-40 dark:text-slate-400"
                    >
                      <Minus className="h-4 w-4" aria-hidden />
                    </button>
                    <span
                      aria-label={`Set ${setIdx + 1} RIR ${set.rir ?? 'not set'}`}
                      className="w-11 text-center text-xs font-semibold tabular-nums"
                    >
                      RIR {set.rir ?? '—'}
                    </span>
                    <button
                      type="button"
                      onClick={() => onSetRir?.(exIdx, setIdx, stepRir(set.rir, 1))}
                      disabled={!onSetRir}
                      aria-label={`Increase RIR for set ${setIdx + 1}`}
                      className="flex min-h-11 w-9 items-center justify-center rounded-r-lg text-slate-500 transition-colors hover:text-emerald-500 disabled:opacity-40 dark:text-slate-400"
                    >
                      <Plus className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {nextSetIdx !== -1 && (
              <button
                type="button"
                onClick={() => {
                  const set = we.sets[nextSetIdx];
                  onLogSet(exIdx, nextSetIdx, set.reps, set.weight, set.rir);
                }}
                className="mt-2.5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 active:bg-emerald-700"
              >
                <Check className="h-4 w-4" aria-hidden />
                Complete set {nextSetIdx + 1}
              </button>
            )}
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
                <Trash2 className="h-4 w-4" aria-hidden />
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
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {activeReference && overloadSuggestion && (
              <button
                type="button"
                onClick={() => {
                  setReps(overloadSuggestion.reps);
                  setWeight(overloadSuggestion.weight);
                }}
                className="mb-4 flex min-h-11 w-full items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-50 px-3 py-2 text-left text-xs text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
              >
                <TrendingUp className="h-4 w-4 shrink-0" aria-hidden />
                <span>
                  Beat last: {describePastSet(activeReference)} · try{' '}
                  <span className="font-semibold">
                    {overloadSuggestion.reps} × {overloadSuggestion.weight} lb
                  </span>
                </span>
              </button>
            )}

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
                    <Minus className="h-4 w-4" aria-hidden />
                  </button>
                  <span className="text-sm font-semibold tabular-nums">{reps}</span>
                  <button
                    type="button"
                    aria-label="Increase reps"
                    onClick={() => setReps((v) => Math.min(100, v + 1))}
                    className="flex min-h-11 min-w-11 items-center justify-center text-slate-500 transition-colors hover:text-emerald-500 dark:text-slate-400"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
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
                    <Minus className="h-4 w-4" aria-hidden />
                  </button>
                  <span className="text-sm font-semibold tabular-nums">{rir}</span>
                  <button
                    type="button"
                    aria-label="Increase RIR"
                    onClick={() => setRir((v) => Math.min(MAX_RIR, v + 1))}
                    className="flex min-h-11 min-w-11 items-center justify-center text-slate-500 transition-colors hover:text-emerald-500 dark:text-slate-400"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
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
