import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearWorkoutSaveQueue,
  enqueueWorkoutSave,
  flushWorkoutSaveQueue,
  getPendingWorkoutSaves,
  quarantineWorkoutSaveQueue,
  saveWorkoutWithOfflineQueue,
} from '~/lib/workout-offline-queue';
import type { WorkoutState } from '~/lib/types';

const USER_A = 'user-a';
const USER_B = 'user-b';

const sample = (date: string): WorkoutState => ({
  date,
  exercises: [],
  cardioExercises: [],
});

describe('workout offline queue', () => {
  beforeEach(() => {
    localStorage.clear();
    clearWorkoutSaveQueue(USER_A);
    clearWorkoutSaveQueue(USER_B);
  });

  it('queues a failed save and flushes it later', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);

    await expect(
      saveWorkoutWithOfflineQueue(USER_A, sample('2026-07-22'), save),
    ).rejects.toThrow(/offline/);
    expect(getPendingWorkoutSaves(USER_A)).toHaveLength(1);

    const result = await flushWorkoutSaveQueue(USER_A, save);
    expect(result.flushed).toBe(1);
    expect(result.remaining).toBe(0);
    expect(getPendingWorkoutSaves(USER_A)).toHaveLength(0);
  });

  it('replaces an older queued snapshot for the same date', () => {
    enqueueWorkoutSave(USER_A, sample('2026-07-22'), 'first');
    const newer = sample('2026-07-22');
    enqueueWorkoutSave(USER_A, newer, 'second');
    const pending = getPendingWorkoutSaves(USER_A);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.lastError).toBe('second');
  });

  it('keeps user A and user B queues fully isolated', () => {
    enqueueWorkoutSave(USER_A, sample('2026-07-22'), 'a-error');
    enqueueWorkoutSave(USER_B, sample('2026-07-23'), 'b-error');

    expect(getPendingWorkoutSaves(USER_A)).toHaveLength(1);
    expect(getPendingWorkoutSaves(USER_B)).toHaveLength(1);
    expect(getPendingWorkoutSaves(USER_A)[0]?.snapshot.date).toBe('2026-07-22');
    expect(getPendingWorkoutSaves(USER_B)[0]?.snapshot.date).toBe('2026-07-23');
  });

  it('regression: A queues offline, signs out, B signs in — B never flushes A\'s snapshot', async () => {
    // User A goes offline mid-workout; save fails and queues.
    const saveA = vi.fn().mockRejectedValueOnce(new Error('offline'));
    await expect(
      saveWorkoutWithOfflineQueue(USER_A, sample('2026-07-22'), saveA),
    ).rejects.toThrow(/offline/);
    expect(getPendingWorkoutSaves(USER_A)).toHaveLength(1);

    // App-level sign-out quarantines A's queue (see AuthContext.signOut).
    quarantineWorkoutSaveQueue(USER_A);
    expect(getPendingWorkoutSaves(USER_A)).toHaveLength(0);

    // User B signs in on the same device and their session drains any
    // "pending" saves — this must be a no-op for B, and must never touch A's
    // snapshot even though both flows share the same browser storage.
    const saveB = vi.fn().mockResolvedValue(undefined);
    expect(getPendingWorkoutSaves(USER_B)).toHaveLength(0);
    const result = await flushWorkoutSaveQueue(USER_B, saveB);
    expect(result.flushed).toBe(0);
    expect(saveB).not.toHaveBeenCalled();
  });

  it('quarantines items whose stored userId does not match the flushing user', async () => {
    enqueueWorkoutSave(USER_A, sample('2026-07-22'), 'a-error');
    // Simulate a corrupted/mismatched entry ending up in B's own key.
    enqueueWorkoutSave(USER_B, sample('2026-07-24'), 'legit-b');
    const tampered = getPendingWorkoutSaves(USER_B).map((item) => ({ ...item, userId: USER_A }));
    localStorage.setItem(
      'fac-workout-offline-queue-v1:user-b',
      JSON.stringify(tampered),
    );

    const save = vi.fn().mockResolvedValue(undefined);
    const result = await flushWorkoutSaveQueue(USER_B, save);
    expect(result.flushed).toBe(0);
    expect(save).not.toHaveBeenCalled();
  });
});
