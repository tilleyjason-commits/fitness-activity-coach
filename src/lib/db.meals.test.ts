import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Meal and exercise-log replacement writes must go through the transactional
 * RPCs from migration 011 (save_meal / delete_meal / replace_exercise_logs):
 * one round trip, atomic, ownership derived from auth.uid(), and no
 * client-side delete-then-insert fallback.
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

describe('saveMeal via save_meal RPC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ data: 'meal-uuid', error: null });
  });

  it('sends the aggregate in one transactional call (totals computed server-side)', async () => {
    const { saveMeal } = await import('~/lib/db');
    await saveMeal('daily-log-1', 'lunch', {
      rawInput: 'turkey sandwich',
      mealTime: '12:30',
      foods: [
        {
          food_name: 'Turkey sandwich',
          quantity: 1,
          unit: 'sandwich',
          calories: 450,
          protein_g: 30,
          carbs_g: 40,
          fat_g: 15,
          confidence: 'high',
        },
      ],
    });

    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [fn, payload] = rpcMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(fn).toBe('save_meal');
    expect(payload.p_daily_log_id).toBe('daily-log-1');
    expect(payload.p_meal_slot).toBe('lunch');
    expect(payload.p_meal_time).toBe('12:30');
    expect(payload.p_raw_input).toBe('turkey sandwich');
    expect(payload.p_foods).toHaveLength(1);
    expect((payload.p_foods as Record<string, unknown>[])[0].food_name).toBe('Turkey sandwich');
    // No client-computed totals and no client-supplied user id.
    expect(JSON.stringify(payload)).not.toMatch(/total_|user_?id/i);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('throws a visible error when the RPC fails (no partial client writes)', async () => {
    const { saveMeal } = await import('~/lib/db');
    rpcMock.mockResolvedValue({ data: null, error: { message: 'daily log not owned by caller' } });

    await expect(
      saveMeal('daily-log-1', 'lunch', { rawInput: '', mealTime: null, foods: [] }),
    ).rejects.toThrow(/not owned/);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('expanded meal slots pass through the RPCs verbatim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ data: 'meal-uuid', error: null });
  });

  it('saveMeal sends pre_workout_snack verbatim to save_meal', async () => {
    const { saveMeal } = await import('~/lib/db');
    await saveMeal('daily-log-1', 'pre_workout_snack', {
      rawInput: 'banana',
      mealTime: '10:15',
      foods: [
        {
          food_name: 'Banana',
          quantity: 1,
          unit: 'medium',
          calories: 105,
          protein_g: 1,
          carbs_g: 27,
          fat_g: 0,
          confidence: 'high',
        },
      ],
    });

    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [fn, payload] = rpcMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(fn).toBe('save_meal');
    expect(payload.p_meal_slot).toBe('pre_workout_snack');
    // Ownership stays server-side: no client-supplied user id, no table fallback.
    expect(JSON.stringify(payload)).not.toMatch(/user_?id/i);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('deleteMeal sends bedtime_snack verbatim to delete_meal', async () => {
    const { deleteMeal } = await import('~/lib/db');
    rpcMock.mockResolvedValue({ data: null, error: null });
    await deleteMeal('daily-log-1', 'bedtime_snack');

    const [fn, payload] = rpcMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(fn).toBe('delete_meal');
    expect(payload).toEqual({ p_daily_log_id: 'daily-log-1', p_meal_slot: 'bedtime_snack' });
    expect(JSON.stringify(payload)).not.toMatch(/user_?id/i);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('deleteMeal via delete_meal RPC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ data: null, error: null });
  });

  it('deletes the slot and resyncs totals in one transactional call', async () => {
    const { deleteMeal } = await import('~/lib/db');
    await deleteMeal('daily-log-1', 'snack');

    const [fn, payload] = rpcMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(fn).toBe('delete_meal');
    expect(payload).toEqual({ p_daily_log_id: 'daily-log-1', p_meal_slot: 'snack' });
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('replaceExerciseLogs via replace_exercise_logs RPC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ data: null, error: null });
  });

  it('sends the entries without per-row daily_log_id duplication', async () => {
    const { replaceExerciseLogs } = await import('~/lib/db');
    await replaceExerciseLogs('daily-log-9', [
      {
        daily_log_id: 'daily-log-9',
        exercise_name: 'Squat',
        sets_completed: 3,
        target_sets: 3,
        reps_completed: 8,
        target_reps: '8',
        weight_lb: 225,
        rir: 2,
        notes: null,
      },
    ]);

    const [fn, payload] = rpcMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(fn).toBe('replace_exercise_logs');
    expect(payload.p_daily_log_id).toBe('daily-log-9');
    const entries = payload.p_entries as Record<string, unknown>[];
    expect(entries[0]).toMatchObject({ exercise_name: 'Squat', sets_completed: 3 });
    expect(entries[0].daily_log_id).toBeUndefined();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('throws a visible error when the RPC fails instead of deleting locally', async () => {
    const { replaceExerciseLogs } = await import('~/lib/db');
    rpcMock.mockResolvedValue({ data: null, error: { message: 'RPC unavailable' } });

    await expect(replaceExerciseLogs('daily-log-9', [])).rejects.toThrow(/RPC unavailable/);
    expect(fromMock).not.toHaveBeenCalled();
  });
});
