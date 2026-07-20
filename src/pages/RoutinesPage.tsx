import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Check, Loader2, Play, RefreshCw, Trash2 } from 'lucide-react';
import { useAuth } from '~/context/AuthContext';
import { PageHeader } from '~/components/PageHeader';
import { ExerciseSelector } from '~/components/ExerciseSelector';
import { getWeeklyRoutines, saveRoutine, saveWorkoutState } from '~/lib/workout-repo';
import {
  TRAINING_DAYS,
  getTodayWeekday,
  replaceWorkoutWithRoutine,
  routineHasItems,
} from '~/lib/workout-mappers';
import type {
  CardioEquipment,
  DailyRoutine,
  Exercise,
  RoutineCardioExercise,
  RoutineExercise,
  Weekday,
  WeeklyRoutines,
} from '~/lib/types';

/** Weekly routine setup: pick a training day (Mon–Fri), edit its preset, save. */
export default function RoutinesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const todayWeekday = getTodayWeekday();

  const [routines, setRoutines] = useState<WeeklyRoutines | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedDay, setSelectedDay] = useState<Weekday>(
    TRAINING_DAYS.includes(todayWeekday) ? todayWeekday : TRAINING_DAYS[0],
  );
  const [name, setName] = useState('');
  const [exercises, setExercises] = useState<RoutineExercise[]>([]);
  const [cardioExercises, setCardioExercises] = useState<RoutineCardioExercise[]>([]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [starting, setStarting] = useState(false);
  const savedFlashTimeoutRef = useRef<number | null>(null);

  const loadRoutines = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(null);
    try {
      const weekly = await getWeeklyRoutines(user.id);
      setRoutines(weekly);
      setSelectedDay((day) => {
        const routine = weekly[day];
        setName(routine.name);
        setExercises(routine.exercises);
        setCardioExercises(routine.cardioExercises);
        return day;
      });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load routines');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadRoutines();
  }, [loadRoutines]);

  useEffect(() => {
    return () => {
      if (savedFlashTimeoutRef.current !== null) {
        window.clearTimeout(savedFlashTimeoutRef.current);
      }
    };
  }, []);

  function selectDay(day: Weekday) {
    if (!routines) return;
    const routine = routines[day];
    setSelectedDay(day);
    setName(routine.name);
    setExercises(routine.exercises);
    setCardioExercises(routine.cardioExercises);
    setSaveError(null);
    setSavedFlash(false);
  }

  function editorRoutine(): DailyRoutine {
    return { day: selectedDay, name: name.trim(), exercises, cardioExercises };
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setSaveError(null);
    try {
      const routine = editorRoutine();
      await saveRoutine(user.id, routine);
      setRoutines((prev) => (prev ? { ...prev, [routine.day]: routine } : prev));
      setSavedFlash(true);
      if (savedFlashTimeoutRef.current !== null) {
        window.clearTimeout(savedFlashTimeoutRef.current);
      }
      savedFlashTimeoutRef.current = window.setTimeout(() => {
        setSavedFlash(false);
        savedFlashTimeoutRef.current = null;
      }, 2500);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save routine');
    } finally {
      setSaving(false);
    }
  }

  async function handleStartWorkout() {
    if (!user) return;
    setStarting(true);
    setSaveError(null);
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      await saveWorkoutState(user.id, replaceWorkoutWithRoutine(editorRoutine(), today));
      navigate('/training');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to start workout');
      setStarting(false);
    }
  }

  function addExercise(exercise: Exercise, targetSets: number, targetReps: number, targetWeight: number) {
    setExercises((prev) => [...prev, { exercise, targetSets, targetReps, targetWeight }]);
  }

  function addCardio(equipment: CardioEquipment, durationMinutes: number, distanceMiles: number) {
    setCardioExercises((prev) => [...prev, { equipment, durationMinutes, distanceMiles }]);
  }

  const allDaysEmpty =
    routines !== null && TRAINING_DAYS.every((day) => !routineHasItems(routines[day]));
  const itemCount = exercises.length + cardioExercises.length;

  const tabBase = 'rounded-lg py-2 text-center text-sm font-medium transition-colors';
  const tabInactive =
    'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200';

  return (
    <div>
      <PageHeader title="Routines" subtitle="Plan your training week" backTo="/training" />

      <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700/60 dark:bg-slate-800">
        <Link to="/training" className={`${tabBase} ${tabInactive}`}>
          Workout
        </Link>
        <Link to="/training" className={`${tabBase} ${tabInactive}`}>
          History
        </Link>
        <span className={`${tabBase} bg-emerald-500 text-white`} aria-current="page">
          Routines
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-500" aria-label="Loading routines" />
        </div>
      ) : loadError ? (
        <div className="card text-center">
          <p className="mb-3 text-sm text-red-500">{loadError}</p>
          <button
            type="button"
            onClick={loadRoutines}
            className="mx-auto flex items-center gap-2 rounded-xl bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      ) : routines ? (
        <div className="space-y-4">
          {allDaysEmpty && (
            <div className="card border-emerald-500/40 py-4 text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No routines yet — pick a day below to set up your training week.
              </p>
            </div>
          )}

          <div className="grid grid-cols-5 gap-1.5" role="tablist" aria-label="Training days">
            {TRAINING_DAYS.map((day) => {
              const routine = routines[day];
              const isSelected = selectedDay === day;
              const hasItems = routineHasItems(routine);
              return (
                <button
                  key={day}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => selectDay(day)}
                  className={`rounded-xl border px-1 py-2.5 text-center transition-colors ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600'
                  }`}
                >
                  <span
                    className={`block text-xs font-semibold ${
                      isSelected ? 'text-emerald-600 dark:text-emerald-400' : ''
                    }`}
                  >
                    {day.slice(0, 3)}
                  </span>
                  <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                    {hasItems
                      ? `${routine.exercises.length + routine.cardioExercises.length} items`
                      : '—'}
                  </span>
                </button>
              );
            })}
          </div>

          <div>
            <label htmlFor="routine-name" className="label">
              Routine name
            </label>
            <input
              id="routine-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`${selectedDay} Routine`}
              className="field"
            />
          </div>

          <ExerciseSelector
            title={`Add to ${selectedDay}`}
            addLabel="Add to Routine"
            onAdd={addExercise}
            onAddCardio={addCardio}
            addedIds={[
              ...exercises.map((item) => item.exercise.id),
              ...cardioExercises.map((item) => item.equipment.id),
            ]}
          />

          <section aria-label={`${selectedDay} routine items`}>
            <h2 className="section-title">{selectedDay} items</h2>
            {itemCount === 0 ? (
              <div className="card py-6 text-center">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Set up your {selectedDay} routine — add strength or cardio above.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {exercises.map((item, index) => (
                  <div
                    key={`${item.exercise.id}-${index}`}
                    className="card flex items-center justify-between gap-2 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{item.exercise.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {item.targetSets} × {item.targetReps} · {item.targetWeight} lb
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExercises((prev) => prev.filter((_, i) => i !== index))}
                      aria-label={`Remove ${item.exercise.name}`}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {cardioExercises.map((item, index) => (
                  <div
                    key={`${item.equipment.id}-${index}`}
                    className="card flex items-center justify-between gap-2 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{item.equipment.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {item.durationMinutes} min
                        {item.distanceMiles > 0 && ` · ${item.distanceMiles} mi`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setCardioExercises((prev) => prev.filter((_, i) => i !== index))
                      }
                      aria-label={`Remove ${item.equipment.name}`}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {saveError && <p className="text-sm text-red-500">{saveError}</p>}

          <button type="button" onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : savedFlash ? (
              <Check className="h-4 w-4" aria-hidden />
            ) : null}
            {savedFlash ? 'Saved' : `Save ${selectedDay} Routine`}
          </button>

          {itemCount > 0 && (
            <button
              type="button"
              onClick={handleStartWorkout}
              disabled={starting}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/50 py-3 text-base font-semibold text-emerald-600 transition-colors hover:bg-emerald-500/10 disabled:opacity-50 dark:text-emerald-400"
            >
              {starting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Play className="h-4 w-4" aria-hidden />
              )}
              Start Workout from Routine
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
