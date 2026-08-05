import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearDailyLogSaveQueue,
  enqueueDailyLogSave,
  flushDailyLogSaveQueue,
  getPendingDailyLogSaves,
  quarantineDailyLogSaveQueue,
  saveDailyLogWithOfflineQueue,
} from '~/lib/daily-log-offline-queue';
import type { DailyLog } from '~/lib/types';

const USER_A = 'user-a';
const USER_B = 'user-b';

beforeEach(() => {
  localStorage.clear();
  clearDailyLogSaveQueue(USER_A);
  clearDailyLogSaveQueue(USER_B);
});

describe('daily log offline queue', () => {
  it('queues a failed save and flushes it later', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ id: 'dl-1' } as DailyLog);

    await expect(
      saveDailyLogWithOfflineQueue(USER_A, '2026-07-22', { sleep_quality: 4 }, save),
    ).rejects.toThrow(/offline/);
    expect(getPendingDailyLogSaves(USER_A)).toHaveLength(1);

    const result = await flushDailyLogSaveQueue(USER_A, save);
    expect(result.flushed).toBe(1);
    expect(result.flushedDates).toEqual(['2026-07-22']);
    expect(getPendingDailyLogSaves(USER_A)).toHaveLength(0);
  });

  it('merges a second offline patch for the same date instead of dropping the first', () => {
    enqueueDailyLogSave(USER_A, '2026-07-22', { sleep_quality: 4 });
    enqueueDailyLogSave(USER_A, '2026-07-22', { daily_protein_g: 180 });
    const pending = getPendingDailyLogSaves(USER_A);
    expect(pending).toHaveLength(1);
    expect(pending[0].patch).toEqual({ sleep_quality: 4, daily_protein_g: 180 });
  });

  it('keeps user A and user B queues fully isolated', () => {
    enqueueDailyLogSave(USER_A, '2026-07-22', { sleep_quality: 4 });
    enqueueDailyLogSave(USER_B, '2026-07-23', { sleep_quality: 2 });
    expect(getPendingDailyLogSaves(USER_A)).toHaveLength(1);
    expect(getPendingDailyLogSaves(USER_B)).toHaveLength(1);
    expect(getPendingDailyLogSaves(USER_A)[0].date).toBe('2026-07-22');
  });

  it('regression: A queues offline, signs out, B signs in — B never flushes A\'s patch', async () => {
    const saveA = vi.fn().mockRejectedValueOnce(new Error('offline'));
    await expect(
      saveDailyLogWithOfflineQueue(USER_A, '2026-07-22', { sleep_quality: 4 }, saveA),
    ).rejects.toThrow(/offline/);
    expect(getPendingDailyLogSaves(USER_A)).toHaveLength(1);

    quarantineDailyLogSaveQueue(USER_A);
    expect(getPendingDailyLogSaves(USER_A)).toHaveLength(0);

    const saveB = vi.fn().mockResolvedValue({ id: 'dl-b' } as DailyLog);
    const result = await flushDailyLogSaveQueue(USER_B, saveB);
    expect(result.flushed).toBe(0);
    expect(saveB).not.toHaveBeenCalled();
  });
});
