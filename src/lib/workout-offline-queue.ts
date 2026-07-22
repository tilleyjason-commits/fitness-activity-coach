/**
 * Offline-first queue for workout saves.
 *
 * When save_workout fails (network / transient), the snapshot is persisted to
 * localStorage and replayed later. Ownership is always auth.uid() on the server
 * via the RPC — queued payloads never include a client-supplied user id.
 */

import type { WorkoutState } from './types';

const QUEUE_KEY = 'fac-workout-offline-queue-v1';

export interface QueuedWorkoutSave {
  id: string;
  enqueuedAt: string;
  snapshot: WorkoutState;
  lastError?: string;
  attempts: number;
}

function readQueue(): QueuedWorkoutSave[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedWorkoutSave[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items: QueuedWorkoutSave[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

export function getPendingWorkoutSaves(): QueuedWorkoutSave[] {
  return readQueue();
}

export function hasPendingWorkoutSaves(): boolean {
  return readQueue().length > 0;
}

/** Enqueue (or replace same-date) a failed workout snapshot. */
export function enqueueWorkoutSave(snapshot: WorkoutState, errorMessage?: string): void {
  const queue = readQueue().filter((item) => item.snapshot.date !== snapshot.date);
  queue.push({
    id: `${snapshot.date}-${Date.now()}`,
    enqueuedAt: new Date().toISOString(),
    snapshot,
    lastError: errorMessage,
    attempts: 0,
  });
  writeQueue(queue);
}

export function clearWorkoutSaveQueue(): void {
  writeQueue([]);
}

/**
 * Attempt every pending save with the provided saver. Successful items are
 * removed; failures stay queued with incremented attempt counts.
 */
export async function flushWorkoutSaveQueue(
  save: (snapshot: WorkoutState) => Promise<void>,
): Promise<{ flushed: number; remaining: number; lastError: string | null }> {
  const queue = readQueue();
  if (queue.length === 0) return { flushed: 0, remaining: 0, lastError: null };

  const remaining: QueuedWorkoutSave[] = [];
  let flushed = 0;
  let lastError: string | null = null;

  for (const item of queue) {
    try {
      await save(item.snapshot);
      flushed += 1;
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Offline sync failed';
      remaining.push({
        ...item,
        attempts: item.attempts + 1,
        lastError,
      });
    }
  }

  writeQueue(remaining);
  return { flushed, remaining: remaining.length, lastError };
}

/**
 * Try a live save first; on failure, queue for later replay and rethrow so the
 * autosave controller can surface the error + retry affordance.
 */
export async function saveWorkoutWithOfflineQueue(
  snapshot: WorkoutState,
  save: (snapshot: WorkoutState) => Promise<void>,
): Promise<void> {
  try {
    await save(snapshot);
    // Opportunistically drain older queued days after a successful online save.
    if (hasPendingWorkoutSaves()) {
      void flushWorkoutSaveQueue(save);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Workout save failed';
    enqueueWorkoutSave(snapshot, message);
    throw error;
  }
}
