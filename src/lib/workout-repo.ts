import { supabase } from './supabase';
import {
  mapActiveWorkoutToState,
  mapRoutineItems,
  mapRoutineRowsToWeeklyRoutines,
  mapWorkoutToHistoryEntry,
} from './workout-mappers';
import type {
  DailyRoutine,
  WeeklyRoutines,
  WorkoutCardioRow,
  WorkoutExerciseRow,
  WorkoutHistoryEntry,
  WorkoutRow,
  WorkoutSetRow,
  WorkoutState,
} from './types';

/**
 * Direct Supabase CRUD for the merged FitTrack tables, following the db.ts
 * pattern (all row casts live here; errors surface as plain Error).
 */

const WORKOUT_COLUMNS = 'id, user_id, workout_date, status, created_at, updated_at';
const EXERCISE_COLUMNS =
  'id, workout_id, exercise_id, exercise_name, muscle_group, target_sets, target_reps, target_weight, sort_order';
const SET_COLUMNS = 'id, workout_exercise_id, set_number, reps, weight, rir, completed, completed_at';
const CARDIO_COLUMNS =
  'id, workout_id, equipment_id, equipment_name, equipment_category, duration_minutes, distance_miles, sort_order';

async function getActiveWorkoutRow(userId: string, date: string): Promise<WorkoutRow | null> {
  const { data, error } = await supabase
    .from('workouts')
    .select(WORKOUT_COLUMNS)
    .eq('user_id', userId)
    .eq('workout_date', date)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return ((data ?? []) as WorkoutRow[])[0] ?? null;
}

async function loadWorkoutChildren(workoutIds: string[]): Promise<{
  exercises: WorkoutExerciseRow[];
  sets: WorkoutSetRow[];
  cardio: WorkoutCardioRow[];
}> {
  if (workoutIds.length === 0) return { exercises: [], sets: [], cardio: [] };

  const { data: exerciseData, error: exerciseError } = await supabase
    .from('workout_exercises')
    .select(EXERCISE_COLUMNS)
    .in('workout_id', workoutIds)
    .order('sort_order', { ascending: true });
  if (exerciseError) throw new Error(exerciseError.message);
  const exercises = (exerciseData ?? []) as WorkoutExerciseRow[];

  let sets: WorkoutSetRow[] = [];
  const exerciseIds = exercises.map((ex) => ex.id);
  if (exerciseIds.length > 0) {
    const { data: setData, error: setError } = await supabase
      .from('workout_sets')
      .select(SET_COLUMNS)
      .in('workout_exercise_id', exerciseIds)
      .order('set_number', { ascending: true });
    if (setError) throw new Error(setError.message);
    sets = (setData ?? []) as WorkoutSetRow[];
  }

  const { data: cardioData, error: cardioError } = await supabase
    .from('workout_cardio')
    .select(CARDIO_COLUMNS)
    .in('workout_id', workoutIds)
    .order('sort_order', { ascending: true });
  if (cardioError) throw new Error(cardioError.message);

  return { exercises, sets, cardio: (cardioData ?? []) as WorkoutCardioRow[] };
}

/** Today's (or any date's) active workout, or null when none has been started. */
export async function getActiveWorkout(userId: string, date: string): Promise<WorkoutState | null> {
  const workout = await getActiveWorkoutRow(userId, date);
  if (!workout) return null;
  const children = await loadWorkoutChildren([workout.id]);
  return mapActiveWorkoutToState({ workout, ...children });
}

/** Completed workouts, newest first. */
export async function getWorkoutHistory(userId: string): Promise<WorkoutHistoryEntry[]> {
  const { data, error } = await supabase
    .from('workouts')
    .select(WORKOUT_COLUMNS)
    .eq('user_id', userId)
    .eq('status', 'completed')
    .order('workout_date', { ascending: false });
  if (error) throw new Error(error.message);
  const workouts = (data ?? []) as WorkoutRow[];
  if (workouts.length === 0) return [];

  const children = await loadWorkoutChildren(workouts.map((w) => w.id));

  return workouts.map((workout) => {
    const exercises = children.exercises.filter((e) => e.workout_id === workout.id);
    const exerciseIds = new Set(exercises.map((e) => e.id));
    return mapWorkoutToHistoryEntry({
      workout,
      exercises,
      sets: children.sets.filter((s) => exerciseIds.has(s.workout_exercise_id)),
      cardio: children.cardio.filter((c) => c.workout_id === workout.id),
    });
  });
}

/**
 * Persist the full active-workout state through the transactional save_workout
 * RPC (migration 011): one atomic replace, ownership derived from auth.uid()
 * on the server, idempotent on retry. There is deliberately NO client-side
 * delete-then-insert fallback — if the RPC is unavailable the save fails
 * visibly and can be retried.
 */
export async function saveWorkoutState(workout: WorkoutState): Promise<void> {
  const { error } = await supabase.rpc('save_workout', {
    p_workout_date: workout.date,
    p_exercises: workout.exercises.map((we) => ({
      exercise_id: we.exercise.id,
      exercise_name: we.exercise.name,
      muscle_group: we.exercise.muscleGroup,
      target_sets: we.targetSets,
      target_reps: we.targetReps,
      target_weight: we.targetWeight,
      sets: we.sets.map((set, setIdx) => ({
        set_number: setIdx + 1,
        reps: set.reps,
        weight: set.weight,
        rir: set.rir,
        completed: set.completed,
      })),
    })),
    p_cardio: workout.cardioExercises.map((ce) => ({
      equipment_id: ce.equipment.id,
      equipment_name: ce.equipment.name,
      equipment_category: ce.equipment.category,
      duration_minutes: ce.durationMinutes,
      distance_miles: ce.distanceMiles,
    })),
  });
  if (error) throw new Error(`Workout save failed (save_workout): ${error.message}`);
}

/** True when the date already has a completed workout (used to avoid silently
 *  auto-populating a second workout the same day). */
export async function hasCompletedWorkout(userId: string, date: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('workouts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('workout_date', date)
    .eq('status', 'completed');
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

/** Mark the date's active workout completed; the DB trigger (migration 006) summarizes it. */
export async function completeWorkout(userId: string, date: string): Promise<void> {
  const { error } = await supabase
    .from('workouts')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('workout_date', date)
    .eq('status', 'active');
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ */
/* Weekly routines                                                     */
/* ------------------------------------------------------------------ */

/** Full week of routines; days without a saved routine come back empty. */
export async function getWeeklyRoutines(userId: string): Promise<WeeklyRoutines> {
  const { data: routineData, error: routineError } = await supabase
    .from('routines')
    .select('id, user_id, day_of_week, name, created_at, updated_at')
    .eq('user_id', userId);
  if (routineError) throw new Error(routineError.message);
  const routines = routineData ?? [];
  if (routines.length === 0) return mapRoutineRowsToWeeklyRoutines([], []);

  const { data: itemData, error: itemError } = await supabase
    .from('routine_items')
    .select(
      'id, routine_id, item_type, exercise_id, exercise_name, muscle_group, target_sets, target_reps, target_weight, cardio_equipment_id, cardio_equipment_name, duration_minutes, distance_miles, sort_order',
    )
    .in(
      'routine_id',
      routines.map((r) => r.id),
    )
    .order('sort_order', { ascending: true });
  if (itemError) throw new Error(itemError.message);

  return mapRoutineRowsToWeeklyRoutines(routines, itemData ?? []);
}

/**
 * Upsert one day's routine and replace its items through the transactional
 * save_routine RPC (migration 011). Ownership derives from auth.uid() server-
 * side; no destructive client-side fallback exists.
 */
export async function saveRoutine(routine: DailyRoutine): Promise<void> {
  const items = mapRoutineItems(routine);
  const { error } = await supabase.rpc('save_routine', {
    p_day_of_week: routine.day,
    p_name: routine.name,
    p_items: items,
  });
  if (error) throw new Error(`Routine save failed (save_routine): ${error.message}`);
}

/* ------------------------------------------------------------------ */
/* User settings (rest timer default)                                  */
/* ------------------------------------------------------------------ */

export async function getRestTimerDefaultSeconds(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('default_rest_timer_seconds')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { default_rest_timer_seconds: number } | null)?.default_rest_timer_seconds ?? 90;
}

export async function saveRestTimerDefaultSeconds(userId: string, seconds: number): Promise<void> {
  const { error } = await supabase
    .from('user_settings')
    .upsert(
      { user_id: userId, default_rest_timer_seconds: seconds, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) throw new Error(error.message);
}
