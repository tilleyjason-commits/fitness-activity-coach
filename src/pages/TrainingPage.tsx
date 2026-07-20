import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { CheckCircle2, Loader2, Play, RefreshCw } from 'lucide-react';
import { useAuth } from '~/context/AuthContext';
import { PageHeader } from '~/components/PageHeader';
import { ExerciseSelector } from '~/components/ExerciseSelector';
import { WorkoutTracker } from '~/components/WorkoutTracker';
import { WorkoutHistory } from '~/components/WorkoutHistory';
import { RestTimer } from '~/components/RestTimer';
import {
  completeWorkout,
  getActiveWorkout,
  getRestTimerDefaultSeconds,
  getWeeklyRoutines,
  getWorkoutHistory,
  saveRestTimerDefaultSeconds,
  saveWorkoutState,
} from '~/lib/workout-repo';
import {
  createCardioWorkoutExercise,
  createWorkoutExercise,
  getTodayWeekday,
  getWorkoutTotals,
  replaceWorkoutWithRoutine,
  routineHasItems,
  updateSetRecord,
} from '~/lib/workout-mappers';
import type {
  CardioEquipment,
  DailyRoutine,
  Exercise,
  WorkoutHistoryEntry,
  WorkoutState,
} from '~/lib/types';

type TrainingMode = 'workout' | 'history';

/** [Workout] [History] [Routines] segment control; Routines lives on its own route. */
function ModeTabs({ mode, onSelect }: { mode: TrainingMode; onSelect: (m: TrainingMode) => void }) {
  const base = 'rounded-lg py-2 text-center text-sm font-medium transition-colors';
  const active = 'bg-emerald-500 text-white';
  const inactive =
    'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200';

  return (
    <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700/60 dark:bg-slate-800">
      <button
        type="button"
        onClick={() => onSelect('workout')}
        className={`${base} ${mode === 'workout' ? active : inactive}`}
        aria-pressed={mode === 'workout'}
      >
        Workout
      </button>
      <button
        type="button"
        onClick={() => onSelect('history')}
        className={`${base} ${mode === 'history' ? active : inactive}`}
        aria-pressed={mode === 'history'}
      >
        History
      </button>
      <Link to="/routines" className={`${base} ${inactive}`}>
        Routines
      </Link>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading workout">
      {[0, 1, 2].map((i) => (
        <div key={i} className="card h-24 animate-pulse bg-slate-200 dark:bg-slate-800" />
      ))}
    </div>
  );
}

/** Training tab: live workout logging with history and routine kick-off. */
export default function TrainingPage() {
  const { user } = useAuth();
  const today = format(new Date(), 'yyyy-MM-dd');

  const [mode, setMode] = useState<TrainingMode>('workout');
  const [workout, setWorkout] = useState<WorkoutState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [history, setHistory] = useState<WorkoutHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [restDefaultSeconds, setRestDefaultSeconds] = useState(90);
  const [showRestTimer, setShowRestTimer] = useState(false);
  const [restTimerKey, setRestTimerKey] = useState(0);

  const [confirmFinish, setConfirmFinish] = useState(false);
  const [finishing, setFinishing] = useState(false);

  // True when local workout state has edits not yet flushed to Supabase.
  const dirtyRef = useRef(false);

  const loadWorkout = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [active, routines, restDefault] = await Promise.all([
        getActiveWorkout(user.id, today),
        getWeeklyRoutines(user.id),
        getRestTimerDefaultSeconds(user.id),
      ]);
      dirtyRef.current = false;
      setRestDefaultSeconds(restDefault);

      const routine = routines[getTodayWeekday()];

      if (!active && routine && routineHasItems(routine)) {
        // Auto-populate the workout from today's routine preset
        setWorkout(replaceWorkoutWithRoutine(routine, today));
        dirtyRef.current = true;
      } else {
        setWorkout(active);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load workout');
    } finally {
      setLoading(false);
    }
  }, [user, today]);

  const loadHistory = useCallback(async () => {
    if (!user) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      setHistory(await getWorkoutHistory(user.id));
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : 'Failed to load history');
    } finally {
      setHistoryLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadWorkout();
    void loadHistory();
  }, [loadWorkout, loadHistory]);

  // Debounced autosave: every mutation marks the state dirty and this flushes it.
  useEffect(() => {
    if (!user || !workout || !dirtyRef.current) return;
    const id = window.setTimeout(() => {
      dirtyRef.current = false;
      saveWorkoutState(user.id, workout).catch((e: unknown) => {
        dirtyRef.current = true;
        setSaveError(e instanceof Error ? e.message : 'Failed to save workout');
      });
    }, 1200);
    return () => window.clearTimeout(id);
  }, [user, workout]);

  const mutateWorkout = useCallback((updater: (current: WorkoutState) => WorkoutState) => {
    setSaveError(null);
    dirtyRef.current = true;
    setWorkout((prev) => (prev ? updater(prev) : prev));
  }, []);

  function startWorkout(routine?: DailyRoutine) {
    setSaveError(null);
    dirtyRef.current = true;
    setWorkout(
      routine
        ? replaceWorkoutWithRoutine(routine, today)
        : { exercises: [], cardioExercises: [], date: today },
    );
  }

  const addExercise = useCallback(
    (exercise: Exercise, sets: number, reps: number, weight: number) => {
      mutateWorkout((current) => ({
        ...current,
        exercises: [...current.exercises, createWorkoutExercise(exercise, sets, reps, weight)],
      }));
    },
    [mutateWorkout],
  );

  const addCardio = useCallback(
    (equipment: CardioEquipment, durationMinutes: number, distanceMiles: number) => {
      mutateWorkout((current) => ({
        ...current,
        cardioExercises: [
          ...current.cardioExercises,
          createCardioWorkoutExercise(equipment, durationMinutes, distanceMiles),
        ],
      }));
    },
    [mutateWorkout],
  );

  const logSet = useCallback(
    (exIdx: number, setIdx: number, reps: number, weight: number, rir: number | null) => {
      mutateWorkout((current) => updateSetRecord(current, exIdx, setIdx, { reps, weight, rir }));
      setShowRestTimer(true);
      setRestTimerKey((key) => key + 1);
    },
    [mutateWorkout],
  );

  const toggleSet = useCallback(
    (exIdx: number, setIdx: number) => {
      mutateWorkout((current) => ({
        ...current,
        exercises: current.exercises.map((we, i) =>
          i !== exIdx
            ? we
            : {
                ...we,
                sets: we.sets.map((s, j) => (j === setIdx ? { ...s, completed: !s.completed } : s)),
              },
        ),
      }));
    },
    [mutateWorkout],
  );

  const removeExercise = useCallback(
    (exIdx: number) => {
      mutateWorkout((current) => ({
        ...current,
        exercises: current.exercises.filter((_, i) => i !== exIdx),
      }));
    },
    [mutateWorkout],
  );

  const removeCardio = useCallback(
    (cardioIdx: number) => {
      mutateWorkout((current) => ({
        ...current,
        cardioExercises: current.cardioExercises.filter((_, i) => i !== cardioIdx),
      }));
    },
    [mutateWorkout],
  );

  async function handleFinishWorkout() {
    if (!user || !workout) return;
    setFinishing(true);
    setSaveError(null);
    try {
      dirtyRef.current = false;
      await saveWorkoutState(user.id, workout);
      await completeWorkout(user.id, today);
      setWorkout(null);
      setConfirmFinish(false);
      setShowRestTimer(false);
      setMode('history');
      await loadHistory();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to finish workout');
    } finally {
      setFinishing(false);
    }
  }

  function handleSaveRestDefault(seconds: number) {
    setRestDefaultSeconds(seconds);
    if (!user) return;
    saveRestTimerDefaultSeconds(user.id, seconds).catch(() => {
      // Non-critical; the in-session default still applies.
    });
  }

  const totals = workout ? getWorkoutTotals(workout) : null;
  const hasItems =
    workout !== null && (workout.exercises.length > 0 || workout.cardioExercises.length > 0);

  return (
    <div>
      <PageHeader title="Training" subtitle="Log sets as you lift" />
      <ModeTabs mode={mode} onSelect={setMode} />

      {mode === 'history' ? (
        <WorkoutHistory
          history={history}
          loading={historyLoading}
          error={historyError}
          onRetry={loadHistory}
        />
      ) : loading ? (
        <LoadingSkeleton />
      ) : loadError ? (
        <div className="card text-center">
          <p className="mb-3 text-sm text-red-500">{loadError}</p>
          <button
            type="button"
            onClick={loadWorkout}
            className="mx-auto flex items-center gap-2 rounded-xl bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      ) : workout === null ? (
        <div className="space-y-4">
          <div className="card py-8 text-center">
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              No routine for today. Set one up in Routines to auto-load your workout, or start a blank one.
            </p>
            <button type="button" onClick={() => startWorkout()} className="btn-primary">
              <Play className="h-4 w-4" aria-hidden />
              Start Blank Workout
            </button>
          </div>

          {history.length > 0 && (
            <section aria-label="Recent workouts">
              <h2 className="section-title">Recent workouts</h2>
              <WorkoutHistory
                history={history}
                loading={historyLoading}
                error={historyError}
                onRetry={loadHistory}
                limit={3}
              />
            </section>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {totals && totals.totalSets > 0 && (
            <div className="card flex items-center justify-between py-3">
              <span className="text-sm font-semibold">
                {totals.completedSets}/{totals.totalSets} sets
                {totals.totalCardioMinutes > 0 && ` · ${totals.totalCardioMinutes} min cardio`}
              </span>
              <div
                className="h-2 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
                role="progressbar"
                aria-valuenow={totals.completedSets}
                aria-valuemin={0}
                aria-valuemax={totals.totalSets}
                aria-label="Completed sets"
              >
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${(totals.completedSets / totals.totalSets) * 100}%` }}
                />
              </div>
            </div>
          )}

          {saveError && <p className="text-sm text-red-500">{saveError}</p>}

          <ExerciseSelector
            onAdd={addExercise}
            onAddCardio={addCardio}
            addedIds={[
              ...workout.exercises.map((we) => we.exercise.id),
              ...workout.cardioExercises.map((ce) => ce.equipment.id),
            ]}
          />

          <WorkoutTracker
            exercises={workout.exercises}
            cardioExercises={workout.cardioExercises}
            onToggleSet={toggleSet}
            onLogSet={logSet}
            onRemoveExercise={removeExercise}
            onRemoveCardioExercise={removeCardio}
          />

          {hasItems && (
            <button
              type="button"
              onClick={() => setConfirmFinish(true)}
              disabled={finishing}
              className="btn-primary"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Finish Workout
            </button>
          )}
        </div>
      )}

      {confirmFinish && workout && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-6"
          role="dialog"
          aria-label="Finish workout confirmation"
        >
          <div className="card w-full max-w-sm text-center shadow-xl">
            <h3 className="mb-1 text-base font-bold">Finish workout?</h3>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              {totals?.completedSets ?? 0}/{totals?.totalSets ?? 0} sets completed. It will be saved
              to your history and summarized into today's log.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmFinish(false)}
                disabled={finishing}
                className="flex-1 rounded-xl bg-slate-200 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
              >
                Keep going
              </button>
              <button
                type="button"
                onClick={handleFinishWorkout}
                disabled={finishing}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
              >
                {finishing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Finish
              </button>
            </div>
          </div>
        </div>
      )}

      {showRestTimer && (
        <RestTimer
          autoStartKey={restTimerKey}
          initialSeconds={restDefaultSeconds}
          onClose={() => setShowRestTimer(false)}
          onSaveDefault={handleSaveRestDefault}
        />
      )}
    </div>
  );
}
