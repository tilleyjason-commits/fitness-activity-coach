import { CARDIO_EQUIPMENT } from './fittrack-cardio';
import { EXERCISES } from './fittrack-exercises';
import type {
  CardioEquipment,
  CardioWorkoutExercise,
  DailyRoutine,
  Exercise,
  RoutineItemInsertRow,
  RoutineItemRow,
  RoutineRow,
  RoutineUpsertRow,
  SetRecord,
  Weekday,
  WeeklyRoutines,
  WorkoutCardioRow,
  WorkoutExercise,
  WorkoutExerciseRow,
  WorkoutHistoryEntry,
  WorkoutRow,
  WorkoutSetRow,
  WorkoutState,
} from './types';

/**
 * Pure workout/routine logic plus the mapping layer between the merged
 * FitTrack tables (workouts / workout_exercises / workout_sets /
 * workout_cardio / routines / routine_items) and the frontend types.
 */

/* ------------------------------------------------------------------ */
/* Workout helpers                                                     */
/* ------------------------------------------------------------------ */

export function createWorkoutExercise(
  exercise: Exercise,
  sets: number,
  reps: number,
  weight: number,
): WorkoutExercise {
  return {
    exercise,
    targetSets: sets,
    targetReps: reps,
    targetWeight: weight,
    sets: Array.from({ length: sets }, () => ({ reps, weight, rir: null, completed: false })),
  };
}

export function createCardioWorkoutExercise(
  equipment: CardioEquipment,
  durationMinutes: number,
  distanceMiles: number,
): CardioWorkoutExercise {
  return { equipment, durationMinutes, distanceMiles };
}

export function updateSetRecord(
  workout: WorkoutState,
  exerciseIndex: number,
  setIndex: number,
  update: Pick<SetRecord, 'reps' | 'weight' | 'rir'>,
): WorkoutState {
  return {
    ...workout,
    exercises: workout.exercises.map((workoutExercise, exIdx) => {
      if (exIdx !== exerciseIndex) return workoutExercise;
      return {
        ...workoutExercise,
        sets: workoutExercise.sets.map((set, idx) =>
          idx === setIndex ? { ...set, ...update, completed: true } : set,
        ),
      };
    }),
  };
}

export function getWorkoutTotals(workout: WorkoutState) {
  const totalSets = workout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
  const completedSets = workout.exercises.reduce(
    (sum, exercise) => sum + exercise.sets.filter((set) => set.completed).length,
    0,
  );
  const totalCardioMinutes = workout.cardioExercises.reduce(
    (sum, cardioExercise) => sum + cardioExercise.durationMinutes,
    0,
  );
  const totalCardioMiles = workout.cardioExercises.reduce(
    (sum, cardioExercise) => sum + (cardioExercise.distanceMiles ?? 0),
    0,
  );

  return { totalSets, completedSets, totalCardioMinutes, totalCardioMiles };
}

/* ------------------------------------------------------------------ */
/* Routine helpers                                                     */
/* ------------------------------------------------------------------ */

export const WEEKDAYS: Weekday[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/** The five training days shown on the Routines page. */
export const TRAINING_DAYS: Weekday[] = WEEKDAYS.slice(0, 5);

export function getTodayWeekday(date = new Date()): Weekday {
  const day = date.getDay();
  return WEEKDAYS[(day + 6) % 7];
}

export function createEmptyWeeklyRoutines(): WeeklyRoutines {
  return WEEKDAYS.reduce((routines, day) => {
    routines[day] = { day, name: '', exercises: [], cardioExercises: [] };
    return routines;
  }, {} as WeeklyRoutines);
}

export function routineHasItems(routine: DailyRoutine): boolean {
  return routine.exercises.length > 0 || routine.cardioExercises.length > 0;
}

export function replaceWorkoutWithRoutine(routine: DailyRoutine, date: string): WorkoutState {
  return {
    date,
    exercises: routine.exercises.map((item) =>
      createWorkoutExercise(item.exercise, item.targetSets, item.targetReps, item.targetWeight),
    ),
    cardioExercises: routine.cardioExercises.map((item) =>
      createCardioWorkoutExercise(item.equipment, item.durationMinutes, item.distanceMiles),
    ),
  };
}

/* ------------------------------------------------------------------ */
/* Workout rows → frontend                                             */
/* ------------------------------------------------------------------ */

export interface LoadedWorkoutData {
  workout: WorkoutRow;
  exercises: WorkoutExerciseRow[];
  sets: WorkoutSetRow[];
  cardio: WorkoutCardioRow[];
}

function mapExerciseRows(data: LoadedWorkoutData): WorkoutExercise[] {
  return data.exercises.map((ex) => ({
    exercise: { id: ex.exercise_id, name: ex.exercise_name, muscleGroup: ex.muscle_group },
    sets: data.sets
      .filter((s) => s.workout_exercise_id === ex.id)
      .sort((a, b) => a.set_number - b.set_number)
      .map((s) => ({ reps: s.reps, weight: s.weight, rir: s.rir, completed: s.completed })),
    targetSets: ex.target_sets,
    targetReps: ex.target_reps,
    targetWeight: ex.target_weight,
  }));
}

function mapCardioRows(data: LoadedWorkoutData): CardioWorkoutExercise[] {
  return [...data.cardio]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((ce) => ({
      equipment: {
        id: ce.equipment_id,
        name: ce.equipment_name,
        category: ce.equipment_category,
        description: '',
      },
      durationMinutes: ce.duration_minutes,
      distanceMiles: ce.distance_miles,
    }));
}

export function mapActiveWorkoutToState(data: LoadedWorkoutData): WorkoutState {
  return {
    date: data.workout.workout_date,
    exercises: mapExerciseRows(data),
    cardioExercises: mapCardioRows(data),
  };
}

export function mapWorkoutToHistoryEntry(data: LoadedWorkoutData): WorkoutHistoryEntry {
  const totalSets = data.exercises.reduce((sum, ex) => sum + ex.target_sets, 0);
  const completedSets = data.sets.filter((s) => s.completed).length;
  const totalCardioMinutes = data.cardio.reduce((sum, ce) => sum + ce.duration_minutes, 0);
  const totalCardioMiles = data.cardio.reduce((sum, ce) => sum + (ce.distance_miles ?? 0), 0);

  return {
    id: data.workout.id,
    date: data.workout.workout_date,
    loggedAt: data.workout.updated_at,
    exercises: mapExerciseRows(data),
    cardioExercises: mapCardioRows(data),
    totalSets,
    completedSets,
    totalCardioMinutes,
    totalCardioMiles,
  };
}

/* ------------------------------------------------------------------ */
/* Routine rows ↔ frontend                                             */
/* ------------------------------------------------------------------ */

function isWeekday(day: string): day is Weekday {
  return WEEKDAYS.includes(day as Weekday);
}

function exerciseFromRow(row: RoutineItemRow): Exercise | null {
  if (!row.exercise_id || !row.exercise_name || !row.muscle_group) return null;
  return (
    EXERCISES.find((exercise) => exercise.id === row.exercise_id) ?? {
      id: row.exercise_id,
      name: row.exercise_name,
      muscleGroup: row.muscle_group,
    }
  );
}

function equipmentFromRow(row: RoutineItemRow): CardioEquipment | null {
  if (!row.cardio_equipment_id || !row.cardio_equipment_name) return null;
  return (
    CARDIO_EQUIPMENT.find((equipment) => equipment.id === row.cardio_equipment_id) ?? {
      id: row.cardio_equipment_id,
      name: row.cardio_equipment_name,
      category: 'Cardio',
      description: '',
    }
  );
}

export function mapRoutineRowsToWeeklyRoutines(
  routineRows: RoutineRow[],
  itemRows: RoutineItemRow[],
): WeeklyRoutines {
  const weekly = createEmptyWeeklyRoutines();

  for (const routineRow of routineRows) {
    if (!isWeekday(routineRow.day_of_week)) continue;
    const routineItems = itemRows
      .filter((item) => item.routine_id === routineRow.id)
      .sort((left, right) => left.sort_order - right.sort_order);

    weekly[routineRow.day_of_week] = {
      day: routineRow.day_of_week,
      name: routineRow.name ?? '',
      exercises: routineItems.flatMap((item) => {
        if (item.item_type !== 'strength') return [];
        const exercise = exerciseFromRow(item);
        if (!exercise) return [];
        return [
          {
            exercise,
            targetSets: item.target_sets ?? 1,
            targetReps: item.target_reps ?? 10,
            targetWeight: item.target_weight ?? 0,
          },
        ];
      }),
      cardioExercises: routineItems.flatMap((item) => {
        if (item.item_type !== 'cardio') return [];
        const equipment = equipmentFromRow(item);
        if (!equipment) return [];
        return [
          {
            equipment,
            durationMinutes: item.duration_minutes ?? 0,
            distanceMiles: item.distance_miles ?? 0,
          },
        ];
      }),
    };
  }

  return weekly;
}

/** Routine items in RPC/row shape: strength first, then cardio, sort_order in display order. */
export function mapRoutineItems(routine: DailyRoutine): RoutineItemInsertRow[] {
  return [
    ...routine.exercises.map(
      (item, index): RoutineItemInsertRow => ({
        item_type: 'strength',
        exercise_id: item.exercise.id,
        exercise_name: item.exercise.name,
        muscle_group: item.exercise.muscleGroup,
        target_sets: item.targetSets,
        target_reps: item.targetReps,
        target_weight: item.targetWeight,
        cardio_equipment_id: null,
        cardio_equipment_name: null,
        duration_minutes: null,
        distance_miles: null,
        sort_order: index,
      }),
    ),
    ...routine.cardioExercises.map(
      (item, index): RoutineItemInsertRow => ({
        item_type: 'cardio',
        exercise_id: null,
        exercise_name: null,
        muscle_group: null,
        target_sets: null,
        target_reps: null,
        target_weight: null,
        cardio_equipment_id: item.equipment.id,
        cardio_equipment_name: item.equipment.name,
        duration_minutes: item.durationMinutes,
        distance_miles: item.distanceMiles,
        sort_order: routine.exercises.length + index,
      }),
    ),
  ];
}

export function mapRoutineToRows(
  userId: string,
  routine: DailyRoutine,
): { routine: RoutineUpsertRow; items: RoutineItemInsertRow[] } {
  return {
    routine: {
      user_id: userId,
      day_of_week: routine.day,
      name: routine.name,
      updated_at: new Date().toISOString(),
    },
    items: mapRoutineItems(routine),
  };
}
