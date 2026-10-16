import { useFocusTrap } from '~/hooks/useFocusTrap';
import { exerciseCue, logTypeLabel, substituteExercises, type CatalogExercise, type LogType } from '~/lib/training-surface';
import { useRef } from 'react';

interface ExerciseDetailSheetProps {
  exercise: CatalogExercise & { logType?: LogType; cue?: string };
  catalog: CatalogExercise[];
  onClose: () => void;
}

/** Own form cues and same-muscle substitutes. Not copied from another app's library. */
export function ExerciseDetailSheet({ exercise, catalog, onClose }: ExerciseDetailSheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true, onClose);
  const substitutes = substituteExercises(exercise, catalog);
  const cue = exercise.cue?.trim() || exerciseCue(exercise);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 px-4 pb-4 sm:items-center">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="exercise-detail-title"
        tabIndex={-1}
        className="card w-full max-w-lg shadow-xl"
      >
        <h3 id="exercise-detail-title" className="text-base font-bold">
          {exercise.name}
        </h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {exercise.muscleGroup}
          {exercise.equipment ? ` · ${exercise.equipment}` : ''}
          {exercise.logType ? ` · ${logTypeLabel(exercise.logType)}` : ''}
        </p>
        <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">{cue}</p>
        {substitutes.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-semibold">If this station is taken</h4>
            <ul className="mt-1 space-y-1 text-sm text-slate-600 dark:text-slate-300">
              {substitutes.map((item) => (
                <li key={item.id}>
                  {item.name}
                  {item.equipment ? ` · ${item.equipment}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
        <button type="button" onClick={onClose} className="btn-primary mt-4">
          Close
        </button>
      </div>
    </div>
  );
}
