/**
 * Offline-first queue for daily_logs patch saves — the write path behind
 * useDailyLog's save(), used by sleep, nutrition, subjective, weight, and
 * manual training logging. Mirrors workout-offline-queue.ts: namespaced per
 * user id, tamper/mismatch entries quarantined instead of replayed,
 * quarantined (not deleted) on sign-out.
 *
 * Patches for the same date are merged, not replaced, while queued: two
 * different pages (e.g. sleep then nutrition) can each patch the same day
 * offline, and losing an earlier page's fields to the last save would drop
 * real user data.
 */

import type { DailyLog } from './types';

const QUEUE_KEY_PREFIX = 'fac-daily-log-offline-queue-v1';
const QUARANTINE_KEY = 'fac-daily-log-offline-queue-quarantine-v1';

export interface QueuedDailyLogSave {
  id: string;
  userId: string;
  date: string;
  patch: Partial<DailyLog>;
  enqueuedAt: string;
  lastError?: string;
  attempts: number;
}

function queueKeyFor(userId: string): string {
  return `${QUEUE_KEY_PREFIX}:${userId}`;
}

function readRaw(key: string): QueuedDailyLogSave[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedDailyLogSave[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRaw(key: string, items: QueuedDailyLogSave[]): void {
  if (items.length === 0) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, JSON.stringify(items));
}

function quarantine(items: QueuedDailyLogSave[]): void {
  if (items.length === 0) return;
  writeRaw(QUARANTINE_KEY, [...readRaw(QUARANTINE_KEY), ...items]);
}

function readQueue(userId: string): QueuedDailyLogSave[] {
  return readRaw(queueKeyFor(userId));
}

function writeQueue(userId: string, items: QueuedDailyLogSave[]): void {
  writeRaw(queueKeyFor(userId), items);
}

export function getPendingDailyLogSaves(userId: string): QueuedDailyLogSave[] {
  return readQueue(userId);
}

export function hasPendingDailyLogSaves(userId: string): boolean {
  return readQueue(userId).length > 0;
}

/** Enqueue a patch, merging onto any already-queued patch for the same date. */
export function enqueueDailyLogSave(
  userId: string,
  date: string,
  patch: Partial<DailyLog>,
  errorMessage?: string,
): void {
  const queue = readQueue(userId);
  const idx = queue.findIndex((item) => item.date === date);
  if (idx === -1) {
    queue.push({
      id: `${date}-${Date.now()}`,
      userId,
      date,
      patch,
      enqueuedAt: new Date().toISOString(),
      lastError: errorMessage,
      attempts: 0,
    });
  } else {
    queue[idx] = {
      ...queue[idx],
      patch: { ...queue[idx].patch, ...patch },
      lastError: errorMessage,
    };
  }
  writeQueue(userId, queue);
}

/** Quarantine (not delete) a user's pending queue, e.g. on sign-out. */
export function quarantineDailyLogSaveQueue(userId: string): void {
  const queue = readQueue(userId);
  if (queue.length === 0) return;
  quarantine(queue);
  writeQueue(userId, []);
}

export function clearDailyLogSaveQueue(userId: string): void {
  writeQueue(userId, []);
}

/**
 * Attempt every pending save for this user. Successful items are removed;
 * failures stay queued with incremented attempt counts. Items whose stored
 * userId doesn't match the caller are quarantined instead of replayed.
 */
export async function flushDailyLogSaveQueue(
  userId: string,
  save: (date: string, patch: Partial<DailyLog>) => Promise<DailyLog>,
): Promise<{ flushed: number; remaining: number; flushedDates: string[]; lastError: string | null }> {
  const queue = readQueue(userId);
  if (queue.length === 0) return { flushed: 0, remaining: 0, flushedDates: [], lastError: null };

  const mismatched = queue.filter((item) => item.userId !== userId);
  if (mismatched.length > 0) quarantine(mismatched);

  const owned = queue.filter((item) => item.userId === userId);
  const remaining: QueuedDailyLogSave[] = [];
  const flushedDates: string[] = [];
  let lastError: string | null = null;

  for (const item of owned) {
    try {
      await save(item.date, item.patch);
      flushedDates.push(item.date);
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Offline sync failed';
      remaining.push({ ...item, attempts: item.attempts + 1, lastError });
    }
  }

  writeQueue(userId, remaining);
  return { flushed: flushedDates.length, remaining: remaining.length, flushedDates, lastError };
}

/**
 * Try a live save first; on failure, queue for later replay and rethrow so
 * the caller can surface the error (matches saveWorkoutWithOfflineQueue).
 */
export async function saveDailyLogWithOfflineQueue(
  userId: string,
  date: string,
  patch: Partial<DailyLog>,
  save: (date: string, patch: Partial<DailyLog>) => Promise<DailyLog>,
): Promise<DailyLog> {
  try {
    const result = await save(date, patch);
    if (hasPendingDailyLogSaves(userId)) {
      void flushDailyLogSaveQueue(userId, save);
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Daily log save failed';
    enqueueDailyLogSave(userId, date, patch, message);
    throw error;
  }
}
