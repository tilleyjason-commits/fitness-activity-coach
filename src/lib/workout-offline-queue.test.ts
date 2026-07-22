import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearWorkoutSaveQueue,
  enqueueWorkoutSave,
  flushWorkoutSaveQueue,
  getPendingWorkoutSaves,
  saveWorkoutWithOfflineQueue,
} from '~/lib/workout-offline-queue';
import type { WorkoutState } from '~/lib/types';

const sample = (date: string): WorkoutState => ({
  date,
  exercises: [],
  cardioExercises: [],
});

describe('workout offline queue', () => {
  beforeEach(() => {
    localStorage.clear();
    clearWorkoutSaveQueue();
  });

  it('queues a failed save and flushes it later', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);

    await expect(saveWorkoutWithOfflineQueue(sample('2026-07-22'), save)).rejects.toThrow(/offline/);
    expect(getPendingWorkoutSaves()).toHaveLength(1);

    const result = await flushWorkoutSaveQueue(save);
    expect(result.flushed).toBe(1);
    expect(result.remaining).toBe(0);
    expect(getPendingWorkoutSaves()).toHaveLength(0);
  });

  it('replaces an older queued snapshot for the same date', () => {
    enqueueWorkoutSave(sample('2026-07-22'), 'first');
    const newer = sample('2026-07-22');
    enqueueWorkoutSave(newer, 'second');
    const pending = getPendingWorkoutSaves();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.lastError).toBe('second');
  });
});
