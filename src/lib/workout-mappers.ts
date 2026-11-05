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
  RoutineSetTarget,
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
  setTargets?: RoutineSetTarget[],
): WorkoutExercise {
  return {
    exercise,
    targetSets: sets,
    targetReps: reps,
    targetWeight: weight,
    sets: Array.from({ length: sets }, (_, index) => ({
      reps: setTargets?.[index]?.reps ?? reps,
      weight: setTargets?.[index]?.weight ?? weight,
      rir: null,
      completed: false,
    })),
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

/**
 * Set only the reps-in-reserve for one set, preserving its completed flag.
 * RIR is judged per set at the moment it ends, so it stays editable both
 * before a set is completed and after — unlike updateSetRecord, this never
 * marks a set done as a side effect.
 */
export function setSetRir(
  workout: WorkoutState,
  exerciseIndex: number,
  setIndex: number,
  rir: number | null,
): WorkoutState {
  return {
    ...workout,
    exercises: workout.exercises.map((workoutExercise, exIdx) => {
      if (exIdx !== exerciseIndex) return workoutExercise;
      return {
        ...workoutExercise,
        sets: workoutExercise.sets.map((set, idx) => (idx === setIndex ? { ...set, rir } : set)),
      };
    }),
  };
}

/** One completed set from a previous session, used as the overload reference. */
export interface PastSet {
  reps: number;
  weight: number;
  rir: number | null;
}

/**
 * Completed sets for one exercise copy from the most recent earlier session
 * that logged it. History arrives newest-first; sessions on or after the
 * current date are skipped so an in-progress day never compares against
 * itself.
 *
 * `occurrence` selects among repeated ids in a session (0 = first copy,
 * 1 = second copy, …), so a top set is compared with the previous top set and
 * a back-off set with the previous back-off set. When the newest session that
 * logged the exercise has no such copy, there is no reference: it does not
 * borrow an older session's copy or the first copy's numbers.
 */
export function findLastPerformance(
  history: WorkoutHistoryEntry[],
  exerciseId: string,
  currentDate: string,
  occurrence = 0,
): PastSet[] | null {
  for (const entry of history) {
    if (entry.date >= currentDate) continue;
    const matches = entry.exercises.filter((we) => we.exercise.id === exerciseId);
    if (matches.length === 0) continue;
    const match = matches[occurrence];
    if (!match) return null;
    const completed = match.sets.filter((set) => set.completed && set.setType !== 'warmup');
    // The newest session that contains this copy is authoritative. Warm-ups or
    // unfinished sets there do not authorize borrowing an older session.
    if (completed.length === 0) return null;
    return completed.map((set) => ({ reps: set.reps, weight: set.weight, rir: set.rir }));
  }
  return null;
}

/**
 * Stable reference to one exercise copy inside a workout: its id plus the
 * ordinal among earlier copies of the same id. Used for history lookups and
 * for prefill provenance, so two copies of one exercise never share guidance.
 */
export function exerciseSlotKey(exerciseId: string, occurrence: number): string {
  return `${exerciseId}#${occurrence}`;
}

/** Slot key for every exercise in order (duplicates qualified by occurrence). */
export function exerciseSlotKeys(exercises: readonly { exercise: { id: string } }[]): string[] {
  const seen = new Map<string, number>();
  return exercises.map((workoutExercise) => {
    const occurrence = seen.get(workoutExercise.exercise.id) ?? 0;
    seen.set(workoutExercise.exercise.id, occurrence + 1);
    return exerciseSlotKey(workoutExercise.exercise.id, occurrence);
  });
}

/** Ordinal of the copy at `index` among earlier copies of the same exercise. */
export function exerciseOccurrenceAt(
  exercises: readonly { exercise: { id: string } }[],
  index: number,
): number {
  const exerciseId = exercises[index]?.exercise.id;
  if (exerciseId === undefined) return 0;
  let occurrence = 0;
  for (let i = 0; i < index; i += 1) {
    if (exercises[i].exercise.id === exerciseId) occurrence += 1;
  }
  return occurrence;
}

/**
 * Slot-key changes caused by deleting one exercise copy. The removed copy's
 * slot goes away, and every later copy of the same exercise shifts down one
 * occurrence (bench#1 becomes bench#0 after the first copy is removed).
 * Callers move any marker or provenance stored under `from` to `to`, so a
 * guard on the surviving copy is not lost or handed to the wrong copy.
 */
export function exerciseSlotRebaseAfterRemoval(
  exercises: readonly { exercise: { id: string } }[],
  removedIndex: number,
): { removedSlot: string; moves: Array<{ from: string; to: string }> } | null {
  const removed = exercises[removedIndex];
  if (!removed) return null;
  const exerciseId = removed.exercise.id;
  const removedOccurrence = exerciseOccurrenceAt(exercises, removedIndex);
  const moves: Array<{ from: string; to: string }> = [];
  let occurrence = 0;
  exercises.forEach((workoutExercise, index) => {
    if (workoutExercise.exercise.id !== exerciseId) return;
    const oldOccurrence = occurrence;
    occurrence += 1;
    if (index === removedIndex) return;
    if (oldOccurrence > removedOccurrence) {
      moves.push({
        from: exerciseSlotKey(exerciseId, oldOccurrence),
        to: exerciseSlotKey(exerciseId, oldOccurrence - 1),
      });
    }
  });
  return { removedSlot: exerciseSlotKey(exerciseId, removedOccurrence), moves };
}

/**
 * Whether a stored prefill marker already covers this exercise copy. Markers
 * written before duplicate support are bare exercise ids and covered every
 * copy, so a bare id still protects each occurrence.
 */
export function isExercisePrefilled(
  markers: ReadonlySet<string>,
  exerciseId: string,
  occurrence: number,
): boolean {
  return markers.has(exerciseSlotKey(exerciseId, occurrence)) || markers.has(exerciseId);
}

/**
 * The prior-session set to compare against for a given set index. A set
 * beyond the last session's count has no reference (null), so an extra set
 * never borrows the final set's numbers.
 */
export function pastSetForIndex(past: PastSet[] | null, setIndex: number): PastSet | null {
  if (past === null) return null;
  return past[setIndex] ?? null;
}

/** Position among working sets (warm-ups excluded), or null for a warm-up. */
export function workingSetIndex(
  sets: { setType?: 'working' | 'warmup' }[],
  setIndex: number,
): number | null {
  if (sets[setIndex]?.setType === 'warmup') return null;
  return sets.slice(0, setIndex).filter((set) => set.setType !== 'warmup').length;
}

/**
 * The prior-session reference for one slot: warm-ups never compare against a
 * working set, and working sets compare in working-set order.
 */
export function pastSetForSlot(
  past: PastSet[] | null,
  sets: { setType?: 'working' | 'warmup' }[],
  setIndex: number,
): PastSet | null {
  const working = workingSetIndex(sets, setIndex);
  return working === null ? null : pastSetForIndex(past, working);
}

/**
 * Copy the previous session's reps / weight / RIR onto one exercise's sets.
 * Working sets are matched to the prior session's working sets in order;
 * warm-up sets, completed sets, sets beyond the prior count, and exercises
 * already in progress (any completed set) are left untouched. Duration-based
 * log types are skipped because PastSet carries no duration. Returns the
 * original reference when nothing changes.
 */
export function prefillExerciseFromPrevious(
  workoutExercise: WorkoutExercise,
  history: WorkoutHistoryEntry[],
  currentDate: string,
  occurrence = 0,
): WorkoutExercise {
  if (workoutExercise.logType === 'duration' || workoutExercise.logType === 'reps_duration') {
    return workoutExercise;
  }
  if (workoutExercise.sets.some((set) => set.completed)) return workoutExercise;
  const past = findLastPerformance(history, workoutExercise.exercise.id, currentDate, occurrence);
  if (!past) return workoutExercise;

  let workingOrdinal = 0;
  let changed = false;
  const sets = workoutExercise.sets.map((set) => {
    if (set.setType === 'warmup') return set;
    const reference = past[workingOrdinal++];
    if (!reference) return set;
    if (
      set.reps === reference.reps &&
      set.weight === reference.weight &&
      set.rir === reference.rir
    ) {
      return set;
    }
    changed = true;
    return { ...set, reps: reference.reps, weight: reference.weight, rir: reference.rir };
  });
  return changed ? { ...workoutExercise, sets } : workoutExercise;
}

/**
 * Prefill the exercise copies selected by slot key (see exerciseSlotKey).
 * A bare exercise id selects only its first copy — legacy callers used ids
 * before duplicates were distinguished, and guessing that the rest were meant
 * too would overwrite a copy the user had already adjusted.
 */
export function applyPreviousSessionToWorkout(
  workout: WorkoutState,
  history: WorkoutHistoryEntry[],
  exerciseSlots: ReadonlySet<string>,
): WorkoutState {
  let changed = false;
  const seen = new Map<string, number>();
  const exercises = workout.exercises.map((workoutExercise) => {
    const exerciseId = workoutExercise.exercise.id;
    const occurrence = seen.get(exerciseId) ?? 0;
    seen.set(exerciseId, occurrence + 1);
    const selected =
      exerciseSlots.has(exerciseSlotKey(exerciseId, occurrence)) ||
      (occurrence === 0 && exerciseSlots.has(exerciseId));
    if (!selected) return workoutExercise;
    const next = prefillExerciseFromPrevious(workoutExercise, history, workout.date, occurrence);
    if (next !== workoutExercise) changed = true;
    return next;
  });
  return changed ? { ...workout, exercises } : workout;
}

/** Simple reps-then-weight double progression: one rep first, load once reps stall near failure. */
export interface OverloadSuggestion {
  reps: number;
  weight: number;
}

const NEAR_FAILURE_RIR = 1;
const OVERLOAD_WEIGHT_STEP_LB = 5;

/**
 * Suggests the next set to beat a prior-session reference: add a rep at the
 * same weight, unless last time was already at or near failure (RIR <= 1), in
 * which case reps reset to the prior count and weight steps up instead. Null
 * input (no prior set for this slot) yields no suggestion.
 */
export function suggestNextSet(past: PastSet | null): OverloadSuggestion | null {
  if (past === null) return null;
  if (past.rir !== null && past.rir <= NEAR_FAILURE_RIR) {
    return { reps: past.reps, weight: past.weight + OVERLOAD_WEIGHT_STEP_LB };
  }
  return { reps: past.reps + 1, weight: past.weight };
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

/** All seven days are presettable — weekend athletes get auto-populate too. */
export const TRAINING_DAYS: Weekday[] = WEEKDAYS;

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
      createWorkoutExercise(
        item.exercise,
        item.targetSets,
        item.targetReps,
        item.targetWeight,
        item.setTargets,
      ),
    ),
    cardioExercises: routine.cardioExercises.map((item) =>
      createCardioWorkoutExercise(item.equipment, item.durationMinutes, item.distanceMiles),
    ),
  };
}

/**
 * Persist one completed set onto the matching routine exercise by id.
 * Fills a dense targetSets-length array so later slots keep their last
 * value (or the legacy single-target default). Returns the original
 * routine when the exercise is not on the preset or the set is out of range.
 */
export function applyCompletedSetToRoutine(
  routine: DailyRoutine,
  exerciseId: string,
  setIndex: number,
  reps: number,
  weight: number,
  exerciseIndex?: number,
): DailyRoutine {
  const matchIndex =
    exerciseIndex !== undefined && routine.exercises[exerciseIndex]?.exercise.id === exerciseId
      ? exerciseIndex
      : routine.exercises.findIndex((item) => item.exercise.id === exerciseId);
  if (matchIndex === -1) return routine;
  const matched = routine.exercises[matchIndex];
  if (setIndex < 0 || setIndex >= matched.targetSets) return routine;

  return {
    ...routine,
    exercises: routine.exercises.map((item, index) => {
      if (index !== matchIndex) return item;
      const nextTargets = densifySetTargets(item);
      nextTargets[setIndex] = { reps, weight };
      return { ...item, setTargets: nextTargets };
    }),
  };
}

export function densifySetTargets(item: {
  targetSets: number;
  targetReps: number;
  targetWeight: number;
  setTargets?: RoutineSetTarget[];
}): RoutineSetTarget[] {
  return Array.from({ length: item.targetSets }, (_, index) =>
    item.setTargets?.[index] ?? { reps: item.targetReps, weight: item.targetWeight },
  );
}

function parseSetTargets(value: unknown): RoutineSetTarget[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const parsed: RoutineSetTarget[] = [];
  let found = false;
  value.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const candidate = entry as { reps?: unknown; weight?: unknown };
    if (typeof candidate.reps !== 'number' || typeof candidate.weight !== 'number') return;
    parsed[index] = { reps: candidate.reps, weight: candidate.weight };
    found = true;
  });
  return found ? parsed : undefined;
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
      .map((s) => ({
        reps: s.reps,
        weight: s.weight,
        rir: s.rir,
        completed: s.completed,
        ...(s.set_type ? { setType: s.set_type } : {}),
        ...(s.duration_seconds != null ? { durationSeconds: s.duration_seconds } : {}),
      })),
    targetSets: ex.target_sets,
    targetReps: ex.target_reps,
    targetWeight: ex.target_weight,
    ...(ex.log_type ? { logType: ex.log_type } : {}),
    ...(ex.notes ? { notes: ex.notes } : {}),
    ...(ex.rest_seconds != null ? { restSeconds: ex.rest_seconds } : {}),
    ...(ex.superset_group != null ? { supersetGroup: ex.superset_group } : {}),
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
            setTargets: parseSetTargets(item.set_targets),
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
        ...(item.setTargets?.length ? { set_targets: densifySetTargets(item) } : {}),
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
