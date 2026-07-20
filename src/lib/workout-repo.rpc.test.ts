import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DailyRoutine, WorkoutState } from '~/lib/types';

/**
 * Replacement writes (workout + routine aggregates) must go through the
 * transactional RPCs from migration 011. The client:
 *   - sends no user id (the RPC derives ownership from auth.uid()),
 *   - performs NO client-side delete-then-insert (no destructive fallback),
 *   - surfaces RPC failures as visible, retryable errors.
 */

const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock('~/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
  },
  isSupabaseConfigured: true,
}));

const WORKOUT: WorkoutState = {
  date: '2026-07-20',
  exercises: [
    {
      exercise: { id: 'bench-press', name: 'Bench Press', muscleGroup: 'Chest' },
      targetSets: 2,
      targetReps: 8,
      targetWeight: 185,
      sets: [
        { reps: 8, weight: 185, rir: 2, completed: true },
        { reps: 6, weight: 185, rir: 1, completed: false },
      ],
    },
  ],
  cardioExercises: [
    {
      equipment: { id: 'treadmill', name: 'Treadmill', category: 'Machine', description: '' },
      durationMinutes: 20,
      distanceMiles: 1.5,
    },
  ],
};

const ROUTINE: DailyRoutine = {
  day: 'Monday',
  name: 'Push Day',
  exercises: [
    {
      exercise: { id: 'ohp', name: 'Overhead Press', muscleGroup: 'Shoulders' },
      targetSets: 3,
      targetReps: 8,
      targetWeight: 95,
    },
  ],
  cardioExercises: [
    {
      equipment: { id: 'bike', name: 'Stationary Bike', category: 'Machine', description: '' },
      durationMinutes: 15,
      distanceMiles: 3,
    },
  ],
};

describe('saveWorkoutState via save_workout RPC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ data: 'workout-uuid', error: null });
  });

  it('maps the workout state onto the RPC payload without any client-supplied user id', async () => {
    const { saveWorkoutState } = await import('~/lib/workout-repo');
    await saveWorkoutState(WORKOUT);

    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [fn, payload] = rpcMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(fn).toBe('save_workout');
    expect(payload.p_workout_date).toBe('2026-07-20');

    const exercises = payload.p_exercises as Record<string, unknown>[];
    expect(exercises).toHaveLength(1);
    expect(exercises[0]).toMatchObject({
      exercise_id: 'bench-press',
      exercise_name: 'Bench Press',
      muscle_group: 'Chest',
      target_sets: 2,
      target_reps: 8,
      target_weight: 185,
    });
    const sets = exercises[0].sets as Record<string, unknown>[];
    expect(sets).toEqual([
      { set_number: 1, reps: 8, weight: 185, rir: 2, completed: true },
      { set_number: 2, reps: 6, weight: 185, rir: 1, completed: false },
    ]);

    const cardio = payload.p_cardio as Record<string, unknown>[];
    expect(cardio[0]).toMatchObject({
      equipment_id: 'treadmill',
      equipment_name: 'Treadmill',
      equipment_category: 'Machine',
      duration_minutes: 20,
      distance_miles: 1.5,
    });

    // Ownership comes from auth.uid() on the server, never the client.
    expect(JSON.stringify(payload)).not.toMatch(/user_?id/i);
    // No destructive client-side fallback.
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('throws a visible error and performs no table writes when the RPC fails', async () => {
    const { saveWorkoutState } = await import('~/lib/workout-repo');
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'function save_workout() does not exist' },
    });

    await expect(saveWorkoutState(WORKOUT)).rejects.toThrow(/save_workout/);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('saveRoutine via save_routine RPC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ data: 'routine-uuid', error: null });
  });

  it('maps the routine onto the RPC payload (strength then cardio, ordered)', async () => {
    const { saveRoutine } = await import('~/lib/workout-repo');
    await saveRoutine(ROUTINE);

    const [fn, payload] = rpcMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(fn).toBe('save_routine');
    expect(payload.p_day_of_week).toBe('Monday');
    expect(payload.p_name).toBe('Push Day');

    const items = payload.p_items as Record<string, unknown>[];
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ item_type: 'strength', exercise_id: 'ohp', sort_order: 0 });
    expect(items[1]).toMatchObject({ item_type: 'cardio', cardio_equipment_id: 'bike', sort_order: 1 });

    expect(JSON.stringify(payload)).not.toMatch(/user_?id/i);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('throws a visible error when the RPC fails instead of falling back to delete-then-insert', async () => {
    const { saveRoutine } = await import('~/lib/workout-repo');
    rpcMock.mockResolvedValue({ data: null, error: { message: 'permission denied' } });

    await expect(saveRoutine(ROUTINE)).rejects.toThrow(/permission denied/);
    expect(fromMock).not.toHaveBeenCalled();
  });
});
