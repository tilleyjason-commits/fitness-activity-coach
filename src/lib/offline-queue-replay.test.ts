import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearWorkoutSaveQueue,
  dequeueWorkoutSave,
  enqueueWorkoutSave,
  flushWorkoutSaveQueue,
  getPendingWorkoutSaves,
  saveWorkoutWithOfflineQueue,
} from '~/lib/workout-offline-queue';
import {
  clearMealSaveQueue,
  dequeueMealSave,
  enqueueMealSave,
  flushMealSaveQueue,
  getPendingMealSaves,
  saveMealWithOfflineQueue,
  type QueuedMealInput,
} from '~/lib/meal-offline-queue';
import {
  clearDailyLogSaveQueue,
  enqueueDailyLogSave,
  flushDailyLogSaveQueue,
  getPendingDailyLogSaves,
  saveDailyLogWithOfflineQueue,
} from '~/lib/daily-log-offline-queue';
import type { DailyLog, WorkoutState } from '~/lib/types';

const USER = 'user-a';
const DATE = '2026-10-13';
const workout = (date: string): WorkoutState => ({ date, exercises: [], cardioExercises: [] });
const meal: QueuedMealInput = { rawInput: 'eggs', mealTime: '08:00', foods: [] };

beforeEach(() => {
  localStorage.clear();
  clearWorkoutSaveQueue(USER);
  clearMealSaveQueue(USER);
  clearDailyLogSaveQueue(USER);
});

describe('workout queue replay safety', () => {
  it('drops the queued snapshot for a date once a live save succeeds', async () => {
    enqueueWorkoutSave(USER, workout(DATE), 'offline');
    const save = vi.fn().mockResolvedValue(undefined);
    await saveWorkoutWithOfflineQueue(USER, workout(DATE), save);
    expect(getPendingWorkoutSaves(USER)).toHaveLength(0);
    await new Promise((r) => setTimeout(r, 0));
    // Only the live save ran; the stale snapshot was never replayed.
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('still drains other dates after a live save', async () => {
    enqueueWorkoutSave(USER, workout('2026-10-12'), 'offline');
    const save = vi.fn().mockResolvedValue(undefined);
    await saveWorkoutWithOfflineQueue(USER, workout(DATE), save);
    await new Promise((r) => setTimeout(r, 0));
    expect(save).toHaveBeenCalledTimes(2);
    expect(getPendingWorkoutSaves(USER)).toHaveLength(0);
  });

  it('dequeueWorkoutSave removes only the matching date', () => {
    enqueueWorkoutSave(USER, workout(DATE));
    enqueueWorkoutSave(USER, workout('2026-10-12'));
    dequeueWorkoutSave(USER, DATE);
    expect(getPendingWorkoutSaves(USER).map((i) => i.snapshot.date)).toEqual(['2026-10-12']);
  });

  it('skips an item that was dequeued while an earlier item was in flight', async () => {
    enqueueWorkoutSave(USER, workout('2026-10-11'));
    enqueueWorkoutSave(USER, workout(DATE));
    const saved: string[] = [];
    const save = vi.fn(async (s: WorkoutState) => {
      saved.push(s.date);
      if (s.date === '2026-10-11') dequeueWorkoutSave(USER, DATE); // workout finished mid-flush
    });
    const result = await flushWorkoutSaveQueue(USER, save);
    expect(saved).toEqual(['2026-10-11']);
    expect(result.remaining).toBe(0);
  });

  it('keeps a failed item queued with its attempt count', async () => {
    enqueueWorkoutSave(USER, workout(DATE));
    const result = await flushWorkoutSaveQueue(USER, vi.fn().mockRejectedValue(new Error('down')));
    expect(result.remaining).toBe(1);
    expect(getPendingWorkoutSaves(USER)[0].attempts).toBe(1);
  });
});

describe('meal queue replay safety', () => {
  it('clears the slot from the queue after a successful live save', async () => {
    enqueueMealSave(USER, DATE, 'breakfast', meal, 'offline');
    await saveMealWithOfflineQueue(USER, DATE, 'breakfast', meal, async () => 'dl', vi.fn());
    expect(getPendingMealSaves(USER)).toHaveLength(0);
  });

  it('dequeueMealSave (used when a meal is cleared) stops a later flush restoring it', async () => {
    enqueueMealSave(USER, DATE, 'lunch', meal, 'offline');
    dequeueMealSave(USER, DATE, 'lunch');
    const save = vi.fn();
    await flushMealSaveQueue(USER, async () => 'dl', save);
    expect(save).not.toHaveBeenCalled();
  });

  it('does not save a slot cleared while the daily log id was resolving', async () => {
    enqueueMealSave(USER, DATE, 'dinner', meal, 'offline');
    const save = vi.fn();
    await flushMealSaveQueue(
      USER,
      async () => {
        dequeueMealSave(USER, DATE, 'dinner');
        return 'dl';
      },
      save,
    );
    expect(save).not.toHaveBeenCalled();
  });
});

describe('daily log queue replay safety', () => {
  it('removes only the fields the live save overwrote', async () => {
    enqueueDailyLogSave(USER, DATE, { sleep_quality: 2, mood: 3 } as Partial<DailyLog>, 'offline');
    const save = vi.fn().mockResolvedValue({ id: 'dl' } as DailyLog);
    await saveDailyLogWithOfflineQueue(USER, DATE, { sleep_quality: 5 } as Partial<DailyLog>, save);
    await new Promise((r) => setTimeout(r, 0));
    // The stale sleep_quality=2 never reached the server; mood=3 was still unsaved and flushed.
    const patches = save.mock.calls.map((c) => c[1]);
    expect(patches).toEqual([{ sleep_quality: 5 }, { mood: 3 }]);
    expect(getPendingDailyLogSaves(USER)).toHaveLength(0);
  });

  it('drops the queue item when the live save covers every queued field', async () => {
    enqueueDailyLogSave(USER, DATE, { sleep_quality: 2 } as Partial<DailyLog>, 'offline');
    await saveDailyLogWithOfflineQueue(
      USER,
      DATE,
      { sleep_quality: 4 } as Partial<DailyLog>,
      vi.fn().mockResolvedValue({ id: 'dl' } as DailyLog),
    );
    expect(getPendingDailyLogSaves(USER)).toHaveLength(0);
  });

  it('flush skips a patch fully superseded mid-flight', async () => {
    enqueueDailyLogSave(USER, '2026-10-11', { mood: 1 } as Partial<DailyLog>);
    enqueueDailyLogSave(USER, DATE, { mood: 2 } as Partial<DailyLog>);
    const save = vi.fn(async (date: string) => {
      if (date === '2026-10-11') {
        // live save for DATE lands while the older date is still flushing
        const q = getPendingDailyLogSaves(USER).filter((i) => i.date !== DATE);
        localStorage.setItem(`fac-daily-log-offline-queue-v1:${USER}`, JSON.stringify(q));
      }
      return { id: 'dl' } as DailyLog;
    });
    await flushDailyLogSaveQueue(USER, save);
    expect(save.mock.calls.map((c) => c[0])).toEqual(['2026-10-11']);
  });
});
