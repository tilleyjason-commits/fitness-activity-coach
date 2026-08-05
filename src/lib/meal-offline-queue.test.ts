import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearMealSaveQueue,
  enqueueMealSave,
  flushMealSaveQueue,
  getPendingMealSaves,
  quarantineMealSaveQueue,
  saveMealWithOfflineQueue,
  type QueuedMealInput,
} from '~/lib/meal-offline-queue';

const USER_A = 'user-a';
const USER_B = 'user-b';

const sampleInput: QueuedMealInput = {
  rawInput: 'Chicken and rice',
  mealTime: '12:00',
  foods: [
    {
      food_name: 'Chicken breast',
      quantity: 6,
      unit: 'oz',
      calories: 280,
      protein_g: 52,
      carbs_g: 0,
      fat_g: 6,
      confidence: 'high',
    },
  ],
};

beforeEach(() => {
  localStorage.clear();
  clearMealSaveQueue(USER_A);
  clearMealSaveQueue(USER_B);
});

describe('meal offline queue', () => {
  it('queues a failed save and flushes it later, ensuring the daily log first', async () => {
    const ensureDailyLogId = vi.fn().mockResolvedValue('dl-1');
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);

    await expect(
      saveMealWithOfflineQueue(USER_A, '2026-07-22', 'lunch', sampleInput, ensureDailyLogId, save),
    ).rejects.toThrow(/offline/);
    expect(getPendingMealSaves(USER_A)).toHaveLength(1);

    const result = await flushMealSaveQueue(USER_A, ensureDailyLogId, save);
    expect(result.flushed).toBe(1);
    expect(ensureDailyLogId).toHaveBeenCalledWith('2026-07-22');
    expect(save).toHaveBeenLastCalledWith('dl-1', 'lunch', sampleInput);
    expect(getPendingMealSaves(USER_A)).toHaveLength(0);
  });

  it('replaces an older queued save for the same date+slot rather than duplicating it', () => {
    enqueueMealSave(USER_A, '2026-07-22', 'lunch', sampleInput, 'first');
    enqueueMealSave(USER_A, '2026-07-22', 'lunch', { ...sampleInput, rawInput: 'updated' }, 'second');
    const pending = getPendingMealSaves(USER_A);
    expect(pending).toHaveLength(1);
    expect(pending[0].input.rawInput).toBe('updated');
  });

  it('keeps user A and user B queues fully isolated', () => {
    enqueueMealSave(USER_A, '2026-07-22', 'lunch', sampleInput);
    enqueueMealSave(USER_B, '2026-07-23', 'dinner', sampleInput);
    expect(getPendingMealSaves(USER_A)).toHaveLength(1);
    expect(getPendingMealSaves(USER_B)).toHaveLength(1);
  });

  it('regression: A queues offline, signs out, B signs in — B never flushes A\'s meal', async () => {
    const ensureDailyLogId = vi.fn().mockResolvedValue('dl-a');
    const saveA = vi.fn().mockRejectedValueOnce(new Error('offline'));
    await expect(
      saveMealWithOfflineQueue(USER_A, '2026-07-22', 'lunch', sampleInput, ensureDailyLogId, saveA),
    ).rejects.toThrow(/offline/);
    expect(getPendingMealSaves(USER_A)).toHaveLength(1);

    quarantineMealSaveQueue(USER_A);
    expect(getPendingMealSaves(USER_A)).toHaveLength(0);

    const saveB = vi.fn().mockResolvedValue(undefined);
    const result = await flushMealSaveQueue(USER_B, ensureDailyLogId, saveB);
    expect(result.flushed).toBe(0);
    expect(saveB).not.toHaveBeenCalled();
  });
});
