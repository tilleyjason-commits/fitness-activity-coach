import { describe, expect, it } from 'vitest';
import type { DailyRoutine, Exercise, WorkoutState } from '~/lib/types';
import {
  applyCompletedSetToRoutine,
  createWorkoutExercise,
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
