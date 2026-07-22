import { useCallback, useEffect, useRef, useState } from 'react';
import { createAutosaveController, type AutosaveController, type AutosaveState } from '~/lib/autosave';
import { SaveStatus } from '~/components/SaveStatus';
import type { WorkoutState as WorkoutStateType } from '~/lib/types';
import { Link, useSearchParams } from 'react-router-dom';
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
  hasCompletedWorkout,
  saveRestTimerDefaultSeconds,
  saveWorkoutState,
} from '~/lib/workout-repo';
import {
  flushWorkoutSaveQueue,
  hasPendingWorkoutSaves,
  saveWorkoutWithOfflineQueue,
} from '~/lib/workout-offline-queue';
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

  // Deep-linkable tab: /training?tab=history opens with History selected
  // (the Routines page "History" tab relies on this).
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<TrainingMode>(() =>
    searchParams.get('tab') === 'history' ? 'history' : 'workout',
  );
  const [workout, setWorkout] = useState<WorkoutState | null>(null);
  const [completedToday, setCompletedToday] = useState(false);
  const [todayRoutine, setTodayRoutine] = useState<DailyRoutine | null>(null);
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

  // True when local workout state has edits not yet handed to the autosaver.
  const dirtyRef = useRef(false);
  // StrictMode can overlap mount loads. Only the newest request may publish
  // state, and starting a workout invalidates any request still in flight.
  const loadWorkoutRequestRef = useRef(0);

  // Single-flight coalescing autosave: one save in flight, newest snapshot
  // wins, stale completions ignored (see src/lib/autosave.ts).
  const autosaveRef = useRef<AutosaveController<WorkoutStateType> | null>(null);
  const [autosaveState, setAutosaveState] = useState<AutosaveState>({
    status: 'idle',
    error: null,
  });

  useEffect(() => {
    if (!user) return;
    const controller = createAutosaveController<WorkoutStateType>(
      (snapshot) => saveWorkoutWithOfflineQueue(snapshot, saveWorkoutState),
      { debounceMs: 1200 },
    );
    // Drain any offline-queued saves from earlier sessions.
    if (hasPendingWorkoutSaves()) {
      void flushWorkoutSaveQueue(saveWorkoutState).then((result) => {
        if (result.flushed > 0) {
          setAutosaveState({ status: 'saved', error: null });
        } else if (result.lastError) {
          setAutosaveState({ status: 'error', error: result.lastError });
        }
      });
    }
    autosaveRef.current = controller;
    setAutosaveState(controller.getState());
    const unsubscribe = controller.subscribe(setAutosaveState);
    return () => {
      unsubscribe();
      controller.dispose();
      autosaveRef.current = null;
    };
  }, [user]);

  const loadWorkout = useCallback(async () => {
    const requestId = ++loadWorkoutRequestRef.current;
    if (!user) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [active, routines, restDefault, alreadyCompleted] = await Promise.all([
        getActiveWorkout(user.id, today),
        getWeeklyRoutines(user.id),
        getRestTimerDefaultSeconds(user.id),
        hasCompletedWorkout(user.id, today),
      ]);
      if (requestId !== loadWorkoutRequestRef.current) return;
      dirtyRef.current = false;
      setRestDefaultSeconds(restDefault);
      setCompletedToday(alreadyCompleted);

      const routine = routines[getTodayWeekday()];
      const routinePreset = routine && routineHasItems(routine) ? routine : null;
      setTodayRoutine(routinePreset);

      if (!active && !alreadyCompleted && routinePreset) {
        // Auto-populate the workout from today's routine preset — but never
        // after a completed workout: repeating a day is an explicit action.
        setWorkout(replaceWorkoutWithRoutine(routinePreset, today));
        dirtyRef.current = true;
      } else {
        setWorkout(active);
      }
    } catch (e) {
      if (requestId !== loadWorkoutRequestRef.current) return;
      setLoadError(e instanceof Error ? e.message : 'Failed to load workout');
    } finally {
      if (requestId === loadWorkoutRequestRef.current) setLoading(false);
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

  // Every mutation marks the state dirty; the controller debounces, coalesces
  // and serializes the actual saves.
  useEffect(() => {
    if (!user || !workout || !dirtyRef.current) return;
    dirtyRef.current = false;
    autosaveRef.current?.schedule(workout);
  }, [user, workout]);

  const mutateWorkout = useCallback((updater: (current: WorkoutState) => WorkoutState) => {
    setSaveError(null);
    dirtyRef.current = true;
    setWorkout((prev) => (prev ? updater(prev) : prev));
  }, []);

  function startWorkout(routine?: DailyRoutine) {
    loadWorkoutRequestRef.current += 1;
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
      // Queue the latest snapshot and drain the autosaver; flush() rejects on
      // failure so we can never mark an unsaved workout as completed.
      dirtyRef.current = false;
      autosaveRef.current?.schedule(workout);
      await (autosaveRef.current?.flush() ?? saveWorkoutState(workout));
      await completeWorkout(user.id, today);
      setWorkout(null);
      setCompletedToday(true);
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
            {completedToday ? (
              <>
                <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
                  <CheckCircle2
                    className="mb-1 mr-1.5 inline h-4 w-4 text-emerald-500"
                    aria-hidden
                  />
                  Today&apos;s workout is completed — nice work! Repeating it is up to you.
                </p>
                <div className="flex flex-col gap-2">
                  {todayRoutine && (
                    <button
                      type="button"
                      onClick={() => startWorkout(todayRoutine)}
                      className="btn-primary"
                    >
                      <RefreshCw className="h-4 w-4" aria-hidden />
                      Repeat today&apos;s routine
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => startWorkout()}
                    className="w-full rounded-xl border border-slate-300 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    Start Blank Workout
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
                  No routine for today. Set one up in Routines to auto-load your workout, or start a blank one.
                </p>
                <button type="button" onClick={() => startWorkout()} className="btn-primary">
                  <Play className="h-4 w-4" aria-hidden />
                  Start Blank Workout
                </button>
              </>
            )}
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

          <SaveStatus state={autosaveState} onRetry={() => autosaveRef.current?.retry()} />

          {saveError && (
            <p role="alert" className="text-sm text-red-500">
              {saveError}
            </p>
          )}

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
