import { describe, expect, it } from 'vitest';
import type { DailyRoutine, Exercise, WorkoutHistoryEntry, WorkoutState } from '~/lib/types';
import {
  applyCompletedSetToRoutine,
  applyPreviousSessionToWorkout,
  findLastPerformance,
  pastSetForIndex,
  prefillExerciseFromPrevious,
  createWorkoutExercise,
  exerciseSlotRebaseAfterRemoval,
  mapRoutineItems,
  mapRoutineRowsToWeeklyRoutines,
  replaceWorkoutWithRoutine,
  suggestNextSet,
} from '~/lib/workout-mappers';

const BENCH: Exercise = { id: 'bench-press', name: 'Bench Press', muscleGroup: 'Chest' };
const ROW: Exercise = { id: 'barbell-row', name: 'Barbell Row', muscleGroup: 'Back' };

function mondayPush(overrides: Partial<DailyRoutine['exercises'][number]> = {}): DailyRoutine {
  return {
    day: 'Monday',
    name: 'Push Day',
    exercises: [
      {
        exercise: BENCH,
        targetSets: 3,
        targetReps: 8,
        targetWeight: 185,
        ...overrides,
      },
    ],
    cardioExercises: [],
  };
}

describe('suggestNextSet', () => {
  it('returns null with no prior set to compare against', () => {
    expect(suggestNextSet(null)).toBeNull();
  });

  it('suggests one more rep at the same weight when RIR left room', () => {
    expect(suggestNextSet({ reps: 10, weight: 185, rir: 2 })).toEqual({
      reps: 11,
      weight: 185,
    });
  });

  it('suggests one more rep when RIR was not logged', () => {
    expect(suggestNextSet({ reps: 8, weight: 135, rir: null })).toEqual({
      reps: 9,
      weight: 135,
    });
  });

  it('suggests a weight step (same reps) once last time was at or near failure', () => {
    expect(suggestNextSet({ reps: 10, weight: 185, rir: 1 })).toEqual({
      reps: 10,
      weight: 190,
    });
    expect(suggestNextSet({ reps: 10, weight: 185, rir: 0 })).toEqual({
      reps: 10,
      weight: 190,
    });
  });
});

describe('applyCompletedSetToRoutine', () => {
  it('writes completed set 1 into routine setTargets[0] without touching later slots', () => {
    const next = applyCompletedSetToRoutine(mondayPush(), 'bench-press', 0, 10, 195);
    expect(next.exercises[0].setTargets).toEqual([
      { reps: 10, weight: 195 },
      { reps: 8, weight: 185 },
      { reps: 8, weight: 185 },
    ]);
    expect(next.exercises[0].targetReps).toBe(8);
    expect(next.exercises[0].targetWeight).toBe(185);
  });

  it('writes a distinct set 2 without losing set 1', () => {
    const afterOne = applyCompletedSetToRoutine(mondayPush(), 'bench-press', 0, 10, 195);
    const afterTwo = applyCompletedSetToRoutine(afterOne, 'bench-press', 1, 8, 200);
    expect(afterTwo.exercises[0].setTargets).toEqual([
      { reps: 10, weight: 195 },
      { reps: 8, weight: 200 },
      { reps: 8, weight: 185 },
    ]);
  });

  it('does not persist a set beyond the routine targetSets count', () => {
    const original = mondayPush();
    const next = applyCompletedSetToRoutine(original, 'bench-press', 3, 5, 225);
    expect(next).toBe(original);
  });

  it('does not change routine composition for an exercise that is not on the routine', () => {
    const original = mondayPush();
    const next = applyCompletedSetToRoutine(original, ROW.id, 0, 12, 135);
    expect(next).toBe(original);
    expect(next.exercises).toHaveLength(1);
    expect(next.exercises[0].exercise.id).toBe('bench-press');
  });

  it('leaves cardio items untouched', () => {
    const routine: DailyRoutine = {
      ...mondayPush(),
      cardioExercises: [
        {
          equipment: { id: 'bike', name: 'Bike', category: 'Machine', description: '' },
          durationMinutes: 15,
          distanceMiles: 3,
        },
      ],
    };
    const next = applyCompletedSetToRoutine(routine, 'bench-press', 0, 9, 190);
    expect(next.cardioExercises).toEqual(routine.cardioExercises);
  });
});

describe('replaceWorkoutWithRoutine per-set targets', () => {
  it('falls back to targetReps/targetWeight when setTargets is missing', () => {
    const workout = replaceWorkoutWithRoutine(mondayPush(), '2026-08-13');
    expect(workout.exercises[0].sets.map((set) => ({ reps: set.reps, weight: set.weight }))).toEqual([
      { reps: 8, weight: 185 },
      { reps: 8, weight: 185 },
      { reps: 8, weight: 185 },
    ]);
  });

  it('seeds each workout set from the matching setTarget and falls back for the rest', () => {
    const workout = replaceWorkoutWithRoutine(
      mondayPush({
        setTargets: [
          { reps: 10, weight: 195 },
          { reps: 8, weight: 200 },
        ],
      }),
      '2026-08-13',
    );
    expect(workout.exercises[0].sets.map((set) => ({ reps: set.reps, weight: set.weight }))).toEqual([
      { reps: 10, weight: 195 },
      { reps: 8, weight: 200 },
      { reps: 8, weight: 185 },
    ]);
  });
});

describe('createWorkoutExercise setTargets', () => {
  it('applies per-set reps and weight when provided', () => {
    const exercise = createWorkoutExercise(BENCH, 2, 8, 185, [
      { reps: 10, weight: 195 },
      { reps: 6, weight: 205 },
    ]);
    expect(exercise.sets[0]).toMatchObject({ reps: 10, weight: 195, completed: false });
    expect(exercise.sets[1]).toMatchObject({ reps: 6, weight: 205, completed: false });
  });
});

describe('routine item set_targets mapping', () => {
  it('round-trips setTargets through row mapping', () => {
    const routine = mondayPush({
      setTargets: [
        { reps: 10, weight: 195 },
        { reps: 8, weight: 200 },
      ],
    });
    const items = mapRoutineItems(routine);
    expect(items[0].set_targets).toEqual([
      { reps: 10, weight: 195 },
      { reps: 8, weight: 200 },
      { reps: 8, weight: 185 },
    ]);

    const weekly = mapRoutineRowsToWeeklyRoutines(
      [
        {
          id: 'r1',
          user_id: 'user-abc',
          day_of_week: 'Monday',
          name: 'Push Day',
          created_at: '2026-08-13',
          updated_at: '2026-08-13',
        },
      ],
      [
        {
          id: 'i1',
          routine_id: 'r1',
          item_type: 'strength',
          exercise_id: BENCH.id,
          exercise_name: BENCH.name,
          muscle_group: BENCH.muscleGroup,
          target_sets: 3,
          target_reps: 8,
          target_weight: 185,
          set_targets: [
            { reps: 10, weight: 195 },
            { reps: 8, weight: 200 },
          ],
          cardio_equipment_id: null,
          cardio_equipment_name: null,
          duration_minutes: null,
          distance_miles: null,
          sort_order: 0,
        },
      ],
    );
    expect(weekly.Monday.exercises[0].setTargets).toEqual([
      { reps: 10, weight: 195 },
      { reps: 8, weight: 200 },
    ]);
  });

  it('treats a missing set_targets column as a legacy single-target exercise', () => {
    const weekly = mapRoutineRowsToWeeklyRoutines(
      [
        {
          id: 'r1',
          user_id: 'user-abc',
          day_of_week: 'Monday',
          name: 'Push Day',
          created_at: '2026-08-13',
          updated_at: '2026-08-13',
        },
      ],
      [
        {
          id: 'i1',
          routine_id: 'r1',
          item_type: 'strength',
          exercise_id: BENCH.id,
          exercise_name: BENCH.name,
          muscle_group: BENCH.muscleGroup,
          target_sets: 3,
          target_reps: 8,
          target_weight: 185,
          cardio_equipment_id: null,
          cardio_equipment_name: null,
          duration_minutes: null,
          distance_miles: null,
          sort_order: 0,
        },
      ],
    );
    expect(weekly.Monday.exercises[0].setTargets).toBeUndefined();
    const workout: WorkoutState = replaceWorkoutWithRoutine(weekly.Monday, '2026-08-13');
    expect(workout.exercises[0].sets[0]).toMatchObject({ reps: 8, weight: 185 });
  });

  it('keeps later setTargets aligned when a hole is stored as null', () => {
    const weekly = mapRoutineRowsToWeeklyRoutines(
      [
        {
          id: 'r1',
          user_id: 'user-abc',
          day_of_week: 'Monday',
          name: 'Push Day',
          created_at: '2026-08-13',
          updated_at: '2026-08-13',
        },
      ],
      [
        {
          id: 'i1',
          routine_id: 'r1',
          item_type: 'strength',
          exercise_id: BENCH.id,
          exercise_name: BENCH.name,
          muscle_group: BENCH.muscleGroup,
          target_sets: 3,
          target_reps: 8,
          target_weight: 185,
          set_targets: [{ reps: 10, weight: 195 }, null, { reps: 6, weight: 205 }] as never,
          cardio_equipment_id: null,
          cardio_equipment_name: null,
          duration_minutes: null,
          distance_miles: null,
          sort_order: 0,
        },
      ],
    );
    const workout = replaceWorkoutWithRoutine(weekly.Monday, '2026-08-13');
    expect(workout.exercises[0].sets.map((set) => ({ reps: set.reps, weight: set.weight }))).toEqual([
      { reps: 10, weight: 195 },
      { reps: 8, weight: 185 },
      { reps: 6, weight: 205 },
    ]);
  });

  it('omits set_targets from the RPC payload until a set has been learned', () => {
    const items = mapRoutineItems(mondayPush());
    expect(items[0]).not.toHaveProperty('set_targets');
  });
});

function historyEntry(
  date: string,
  sets: WorkoutState['exercises'][number]['sets'],
  exercise: Exercise = BENCH,
): WorkoutHistoryEntry {
  return {
    id: `h-${date}`,
    loggedAt: `${date}T12:00:00Z`,
    totalSets: sets.length,
    completedSets: sets.filter((set) => set.completed).length,
    totalCardioMinutes: 0,
    totalCardioMiles: 0,
    date,
    cardioExercises: [],
    exercises: [
      { exercise, targetSets: sets.length, targetReps: 8, targetWeight: 0, sets },
    ],
  };
}

const LAST_MONDAY = historyEntry('2026-10-26', [
  { reps: 8, weight: 185, rir: 2, completed: true },
  { reps: 7, weight: 190, rir: 1, completed: true },
  { reps: 6, weight: 190, rir: 0, completed: true },
  { reps: 5, weight: 190, rir: null, completed: false },
]);

describe('pastSetForIndex', () => {
  const past = [
    { reps: 8, weight: 185, rir: 2 },
    { reps: 7, weight: 190, rir: 1 },
  ];
  it('returns the set at the index', () => {
    expect(pastSetForIndex(past, 1)).toEqual(past[1]);
  });
  it('returns null beyond the prior session set count instead of reusing the last set', () => {
    expect(pastSetForIndex(past, 2)).toBeNull();
    expect(pastSetForIndex(null, 0)).toBeNull();
  });
});

describe('findLastPerformance', () => {
  it('ignores incomplete and warm-up sets', () => {
    const entry = historyEntry('2026-10-26', [
      { reps: 10, weight: 95, rir: null, completed: true, setType: 'warmup' },
      { reps: 8, weight: 185, rir: 2, completed: true, setType: 'working' },
      { reps: 8, weight: 185, rir: null, completed: false },
    ]);
    expect(findLastPerformance([entry], BENCH.id, '2026-11-02')).toEqual([
      { reps: 8, weight: 185, rir: 2 },
    ]);
  });
});

describe('previous-session prefill', () => {
  it('copies completed reps, weight and RIR from the last session onto untouched sets', () => {
    const fresh = createWorkoutExercise(BENCH, 3, 10, 50);
    const filled = prefillExerciseFromPrevious(fresh, [LAST_MONDAY], '2026-11-02');
    expect(filled.sets.map((s) => [s.reps, s.weight, s.rir, s.completed])).toEqual([
      [8, 185, 2, false],
      [7, 190, 1, false],
      [6, 190, 0, false],
    ]);
  });

  it('only fills as many sets as the last session completed; extra sets keep their own values', () => {
    const fresh = createWorkoutExercise(BENCH, 5, 10, 50);
    const filled = prefillExerciseFromPrevious(fresh, [LAST_MONDAY], '2026-11-02');
    expect(filled.sets.slice(3).map((s) => [s.reps, s.weight, s.rir])).toEqual([
      [10, 50, null],
      [10, 50, null],
    ]);
  });

  it('uses the most recent earlier session, ignoring same-day and future entries', () => {
    const newer = historyEntry('2026-10-30', [{ reps: 9, weight: 195, rir: 1, completed: true }]);
    const sameDay = historyEntry('2026-11-02', [{ reps: 1, weight: 1, rir: 0, completed: true }]);
    const filled = prefillExerciseFromPrevious(
      createWorkoutExercise(BENCH, 1, 10, 50),
      [sameDay, newer, LAST_MONDAY],
      '2026-11-02',
    );
    expect(filled.sets[0]).toMatchObject({ reps: 9, weight: 195, rir: 1 });
  });

  it('leaves warm-up sets alone and matches working sets in order', () => {
    const fresh = createWorkoutExercise(BENCH, 3, 10, 50);
    fresh.sets[0] = { reps: 12, weight: 45, rir: null, completed: false, setType: 'warmup' };
    const filled = prefillExerciseFromPrevious(fresh, [LAST_MONDAY], '2026-11-02');
    expect(filled.sets[0]).toEqual(fresh.sets[0]);
    expect(filled.sets[1]).toMatchObject({ reps: 8, weight: 185, rir: 2 });
    expect(filled.sets[2]).toMatchObject({ reps: 7, weight: 190, rir: 1 });
  });

  it('does not touch an exercise already in progress', () => {
    const fresh = createWorkoutExercise(BENCH, 2, 10, 50);
    fresh.sets[0] = { reps: 10, weight: 50, rir: 3, completed: true };
    expect(prefillExerciseFromPrevious(fresh, [LAST_MONDAY], '2026-11-02')).toBe(fresh);
  });

  it('skips duration-based log types', () => {
    const fresh = { ...createWorkoutExercise(BENCH, 2, 10, 50), logType: 'duration' as const };
    expect(prefillExerciseFromPrevious(fresh, [LAST_MONDAY], '2026-11-02')).toBe(fresh);
  });

  it('returns the same reference when there is no history or nothing changes', () => {
    const fresh = createWorkoutExercise(BENCH, 2, 10, 50);
    expect(prefillExerciseFromPrevious(fresh, [], '2026-11-02')).toBe(fresh);
    const once = prefillExerciseFromPrevious(fresh, [LAST_MONDAY], '2026-11-02');
    expect(prefillExerciseFromPrevious(once, [LAST_MONDAY], '2026-11-02')).toBe(once);
  });

  it('applies only to the requested exercise ids', () => {
    const workout: WorkoutState = {
      date: '2026-11-02',
      cardioExercises: [],
      exercises: [createWorkoutExercise(BENCH, 2, 10, 50), createWorkoutExercise(ROW, 2, 10, 50)],
    };
    const rowHistory = historyEntry('2026-10-26', [{ reps: 12, weight: 100, rir: 3, completed: true }], ROW);
    const next = applyPreviousSessionToWorkout(workout, [LAST_MONDAY, rowHistory], new Set([BENCH.id]));
    expect(next.exercises[0].sets[0]).toMatchObject({ reps: 8, weight: 185, rir: 2 });
    expect(next.exercises[1]).toBe(workout.exercises[1]);
  });
});

describe('duplicate exercises match by occurrence', () => {
  /** One session that logged Bench twice: a top set, then a back-off set. */
  function duplicateSession(date = '2026-10-26'): WorkoutHistoryEntry {
    const entry = historyEntry(date, [{ reps: 5, weight: 225, rir: 1, completed: true }]);
    const backoff = createWorkoutExercise(BENCH, 1, 15, 135);
    backoff.sets[0] = { reps: 15, weight: 135, rir: 2, completed: true };
    return { ...entry, exercises: [entry.exercises[0], backoff] };
  }

  function duplicateWorkout(): WorkoutState {
    return {
      date: '2026-11-02',
      cardioExercises: [],
      exercises: [createWorkoutExercise(BENCH, 1, 5, 185), createWorkoutExercise(BENCH, 2, 10, 135)],
    };
  }

  it('returns the prior working sets of the requested occurrence', () => {
    expect(findLastPerformance([duplicateSession()], BENCH.id, '2026-11-02', 0)).toEqual([
      { reps: 5, weight: 225, rir: 1 },
    ]);
    expect(findLastPerformance([duplicateSession()], BENCH.id, '2026-11-02', 1)).toEqual([
      { reps: 15, weight: 135, rir: 2 },
    ]);
  });

  it('does not fall back to an older session when the newest matching session lacks that occurrence', () => {
    const newest = historyEntry('2026-10-30', [{ reps: 5, weight: 225, rir: 1, completed: true }]);
    expect(findLastPerformance([newest, LAST_MONDAY], BENCH.id, '2026-11-02', 1)).toBeNull();
  });

  it('does not borrow older working sets when the newest session has the copy but no completed working sets', () => {
    const newest = duplicateSession('2026-10-30');
    newest.exercises[1].sets = [{ reps: 12, weight: 45, rir: null, completed: true, setType: 'warmup' }];
    expect(findLastPerformance([newest, LAST_MONDAY], BENCH.id, '2026-11-02', 1)).toBeNull();
  });

  it('keeps the most-recent-session rule for each occurrence', () => {
    const newer = duplicateSession('2026-10-30');
    expect(findLastPerformance([newer, LAST_MONDAY], BENCH.id, '2026-11-02', 1)).toEqual([
      { reps: 15, weight: 135, rir: 2 },
    ]);
  });

  it('prefills each copy from its matching prior occurrence, in working-set order', () => {
    const next = applyPreviousSessionToWorkout(
      duplicateWorkout(),
      [duplicateSession()],
      new Set(['bench-press#0', 'bench-press#1']),
    );
    expect(next.exercises[0].sets.map((set) => [set.reps, set.weight, set.rir])).toEqual([
      [5, 225, 1],
    ]);
    expect(next.exercises[1].sets.map((set) => [set.reps, set.weight, set.rir])).toEqual([
      [15, 135, 2],
      [10, 135, null],
    ]);
  });

  it('leaves a copy with no matching prior occurrence on its own targets', () => {
    const workout = duplicateWorkout();
    const next = applyPreviousSessionToWorkout(
      workout,
      [LAST_MONDAY],
      new Set(['bench-press#0', 'bench-press#1']),
    );
    expect(next.exercises[0].sets[0]).toMatchObject({ reps: 8, weight: 185, rir: 2 });
    expect(next.exercises[1]).toBe(workout.exercises[1]);
  });

  it('does not let a bare exercise id select later occurrences', () => {
    const workout = duplicateWorkout();
    const next = applyPreviousSessionToWorkout(workout, [duplicateSession()], new Set([BENCH.id]));
    expect(next.exercises[0].sets[0]).toMatchObject({ reps: 5, weight: 225, rir: 1 });
    expect(next.exercises[1]).toBe(workout.exercises[1]);
  });
});

describe('exerciseSlotRebaseAfterRemoval', () => {
  const copies = [
    { exercise: BENCH },
    { exercise: BENCH },
    { exercise: BENCH },
    { exercise: ROW },
  ];

  it('moves the removed slot and shifts later duplicates down one occurrence', () => {
    expect(exerciseSlotRebaseAfterRemoval(copies, 0)).toEqual({
      removedSlot: 'bench-press#0',
      moves: [
        { from: 'bench-press#1', to: 'bench-press#0' },
        { from: 'bench-press#2', to: 'bench-press#1' },
      ],
    });
  });

  it('keeps earlier copies in place when a middle duplicate is removed', () => {
    expect(exerciseSlotRebaseAfterRemoval(copies, 1)).toEqual({
      removedSlot: 'bench-press#1',
      moves: [{ from: 'bench-press#2', to: 'bench-press#1' }],
    });
  });

  it('returns no moves for a unique exercise and ignores other exercises', () => {
    expect(exerciseSlotRebaseAfterRemoval(copies, 3)).toEqual({
      removedSlot: 'barbell-row#0',
      moves: [],
    });
    expect(exerciseSlotRebaseAfterRemoval([], 0)).toBeNull();
  });
});
