import type { PastSet } from '~/lib/workout-mappers';
import type { WorkoutExercise } from '~/lib/types';
import { logTypeLabel } from '~/lib/training-surface';

interface FocusWorkoutProps {
  exercises: WorkoutExercise[];
  index: number;
  onIndex: (index: number) => void;
  onLogSet: (exerciseIndex: number, setIndex: number, reps: number, weight: number, rir: number | null) => void;
  onNote: (exerciseIndex: number, note: string) => void;
  pastByExerciseId: Record<string, PastSet[]>;
}

/** One exercise on screen. The list view stays available from the parent toggle. */
export function FocusWorkout({
  exercises,
  index,
  onIndex,
  onLogSet,
  onNote,
  pastByExerciseId,
}: FocusWorkoutProps) {
  const current = exercises[index];
  if (!current) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Add an exercise to use focus mode.</p>;
  }
  const nextOpen = current.sets.findIndex((set) => !set.completed);
  const setIndex = nextOpen === -1 ? current.sets.length - 1 : nextOpen;
  const set = current.sets[setIndex];
  const past = pastByExerciseId[current.exercise.id]?.[setIndex];

  return (
    <section className="card" aria-label="Current exercise">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          className="min-h-11 rounded-xl px-3 text-sm font-semibold text-slate-600 dark:text-slate-300"
          onClick={() => onIndex(Math.max(0, index - 1))}
          disabled={index === 0}
        >
          Previous
        </button>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {index + 1} / {exercises.length}
        </p>
        <button
          type="button"
          className="min-h-11 rounded-xl px-3 text-sm font-semibold text-slate-600 dark:text-slate-300"
          onClick={() => onIndex(Math.min(exercises.length - 1, index + 1))}
          disabled={index === exercises.length - 1}
        >
          Next
        </button>
      </div>
      <h2 className="text-xl font-bold">{current.exercise.name}</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        {current.exercise.muscleGroup}
        {current.logType ? ` · ${logTypeLabel(current.logType)}` : ''}
        {current.supersetGroup ? ` · Superset ${current.supersetGroup}` : ''}
        {current.restSeconds ? ` · ${current.restSeconds}s rest` : ''}
      </p>
      {past && (
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Last time: {past.reps} × {past.weight} lb
          {past.rir !== null ? ` · RIR ${past.rir}` : ''}
        </p>
      )}
      {set && (
        <button
          type="button"
          className="btn-primary mt-4"
          onClick={() => onLogSet(index, setIndex, set.reps, set.weight, set.rir)}
        >
          Complete set {setIndex + 1}
        </button>
      )}
      <label className="mt-4 block text-sm font-semibold" htmlFor="focus-note">
        Note
      </label>
      <textarea
        id="focus-note"
        className="field mt-1 min-h-20"
        value={current.notes ?? ''}
        onChange={(event) => onNote(index, event.target.value)}
        maxLength={500}
      />
    </section>
  );
}
