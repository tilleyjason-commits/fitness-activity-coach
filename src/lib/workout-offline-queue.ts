/**
 * Offline-first queue for workout saves.
 *
 * When save_workout fails (network / transient), the snapshot is persisted to
 * localStorage and replayed later. Ownership is always auth.uid() on the server
 * via the RPC — queued payloads never include a client-supplied user id.
 *
 * The queue is namespaced per signed-in user: a shared browser can have more
 * than one account sign in across a session, and a snapshot queued while
 * offline as user A must never be flushed (and re-attributed) under user B's
 * session after an account switch. Each item also carries its own `userId` so
 * a flush defensively refuses to replay anything that doesn't match the
 * caller's current user, quarantining it instead.
 */

import type { WorkoutState } from './types';

const QUEUE_KEY_PREFIX = 'fac-workout-offline-queue-v1';
const LEGACY_QUEUE_KEY = 'fac-workout-offline-queue-v1';
const QUARANTINE_KEY = 'fac-workout-offline-queue-quarantine-v1';

let legacyMigrated = false;

export interface QueuedWorkoutSave {
  id: string;
  userId: string;
  enqueuedAt: string;
  snapshot: WorkoutState;
  lastError?: string;
  attempts: number;
}

function queueKeyFor(userId: string): string {
  return `${QUEUE_KEY_PREFIX}:${userId}`;
}

function readRaw(key: string): QueuedWorkoutSave[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedWorkoutSave[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRaw(key: string, items: QueuedWorkoutSave[]): void {
  if (items.length === 0) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, JSON.stringify(items));
}

function quarantine(items: QueuedWorkoutSave[]): void {
  if (items.length === 0) return;
  const existing = readRaw(QUARANTINE_KEY);
  writeRaw(QUARANTINE_KEY, [...existing, ...items]);
}

/**
 * One-time sweep of the pre-namespacing global queue key. These items predate
 * per-user isolation, so we cannot safely attribute them to whichever user
 * happens to be signed in first after upgrade — quarantine them instead of
 * silently adopting or discarding them.
 */
function migrateLegacyQueueOnce(): void {
  if (legacyMigrated) return;
  legacyMigrated = true;
  try {
    const raw = localStorage.getItem(LEGACY_QUEUE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Legacy items lack userId; tag them so quarantine review can spot them.
      const tagged = (parsed as Array<Partial<QueuedWorkoutSave>>).map((item) => ({
        id: item.id ?? `legacy-${Date.now()}`,
        userId: item.userId ?? 'unknown-legacy',
        enqueuedAt: item.enqueuedAt ?? new Date().toISOString(),
        snapshot: item.snapshot as WorkoutState,
        lastError: item.lastError,
        attempts: item.attempts ?? 0,
      }));
      quarantine(tagged);
    }
  } catch {
    // Malformed legacy payload — drop it rather than block startup.
  } finally {
    localStorage.removeItem(LEGACY_QUEUE_KEY);
  }
}

function readQueue(userId: string): QueuedWorkoutSave[] {
  migrateLegacyQueueOnce();
  return readRaw(queueKeyFor(userId));
}

function writeQueue(userId: string, items: QueuedWorkoutSave[]): void {
  writeRaw(queueKeyFor(userId), items);
}

export function getPendingWorkoutSaves(userId: string): QueuedWorkoutSave[] {
  return readQueue(userId);
}

export function hasPendingWorkoutSaves(userId: string): boolean {
  return readQueue(userId).length > 0;
}

/** Enqueue (or replace same-date) a failed workout snapshot for this user. */
export function enqueueWorkoutSave(
  userId: string,
  snapshot: WorkoutState,
  errorMessage?: string,
): void {
  const queue = readQueue(userId).filter((item) => item.snapshot.date !== snapshot.date);
  queue.push({
    id: `${snapshot.date}-${Date.now()}`,
    userId,
    enqueuedAt: new Date().toISOString(),
    snapshot,
    lastError: errorMessage,
    attempts: 0,
  });
  writeQueue(userId, queue);
}

/** Quarantine (not delete) a user's pending queue, e.g. on sign-out. */
export function quarantineWorkoutSaveQueue(userId: string): void {
  const queue = readQueue(userId);
  if (queue.length === 0) return;
  quarantine(queue);
  writeQueue(userId, []);
}

export function clearWorkoutSaveQueue(userId: string): void {
  writeQueue(userId, []);
}

/**
 * Attempt every pending save for this user with the provided saver.
 * Successful items are removed; failures stay queued with incremented attempt
 * counts. Any item whose userId doesn't match the caller (should be
 * unreachable given per-user storage, but checked defensively) is quarantined
 * instead of replayed.
 */
export async function flushWorkoutSaveQueue(
  userId: string,
  save: (snapshot: WorkoutState) => Promise<void>,
): Promise<{ flushed: number; remaining: number; lastError: string | null }> {
  const queue = readQueue(userId);
  if (queue.length === 0) return { flushed: 0, remaining: 0, lastError: null };

  const mismatched = queue.filter((item) => item.userId !== userId);
  if (mismatched.length > 0) {
    quarantine(mismatched);
  }

  const owned = queue.filter((item) => item.userId === userId);
  const remaining: QueuedWorkoutSave[] = [];
  let flushed = 0;
  let lastError: string | null = null;

  for (const item of owned) {
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

  writeQueue(userId, remaining);
  return { flushed, remaining: remaining.length, lastError };
}

/**
 * Try a live save first; on failure, queue for later replay and rethrow so the
 * autosave controller can surface the error + retry affordance.
 */
export async function saveWorkoutWithOfflineQueue(
  userId: string,
  snapshot: WorkoutState,
  save: (snapshot: WorkoutState) => Promise<void>,
): Promise<void> {
  try {
    await save(snapshot);
    // Opportunistically drain older queued days after a successful online save.
    if (hasPendingWorkoutSaves(userId)) {
      void flushWorkoutSaveQueue(userId, save);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Workout save failed';
    enqueueWorkoutSave(userId, snapshot, message);
    throw error;
  }
}
