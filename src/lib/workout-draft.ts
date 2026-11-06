/**
 * Immediate local snapshot of an in-progress workout.
 *
 * Cloud autosave is debounced and discarded on unmount. Mobile window switches
 * (Safari/PWA token refresh, tab eviction) remount TrainingPage before that
 * save lands, so the latest sets must live in localStorage first.
 */
import type { Weekday, WorkoutState } from './types';
import { exerciseSlotKeys, TRAINING_DAYS } from './workout-mappers';

const DRAFT_PREFIX = 'fac-workout-draft-v1:';
const SOURCE_DAY_PREFIX = 'fac-workout-source-day-v1:';

export function workoutDraftKey(userId: string): string {
  return `${DRAFT_PREFIX}${userId}`;
}

function sourceDayKey(userId: string, date: string): string {
  return `${SOURCE_DAY_PREFIX}${userId}:${date}`;
}

export function persistWorkoutSourceDay(userId: string, date: string, day: Weekday | null): void {
  try {
    const key = sourceDayKey(userId, date);
    if (!day) localStorage.removeItem(key);
    else localStorage.setItem(key, day);
  } catch {
    // Storage failures must never block starting a workout.
  }
}

export function readWorkoutSourceDay(userId: string, date: string): Weekday | null {
  try {
    const value = localStorage.getItem(sourceDayKey(userId, date));
    return TRAINING_DAYS.includes(value as Weekday) ? (value as Weekday) : null;
  } catch {
    return null;
  }
}

function isWorkoutState(value: unknown): value is WorkoutState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as WorkoutState;
  return (
    typeof candidate.date === 'string' &&
    Array.isArray(candidate.exercises) &&
    Array.isArray(candidate.cardioExercises)
  );
}

export function persistWorkoutDraft(
  userId: string,
  workout: WorkoutState,
  pendingPrefill: ReadonlyMap<string, string> = new Map(),
): void {
  try {
    // Local-only provenance, saved atomically with the exact snapshot. Only
    // unchanged machine-created exercises remain eligible after a remount.
    // Keyed by slot so the second copy of a duplicated exercise keeps its own
    // provenance; a bare-id fingerprint from an older draft still matches.
    const slots = exerciseSlotKeys(workout.exercises);
    const pending = Object.fromEntries(workout.exercises.flatMap((we, index) => {
      const fingerprint = pendingPrefill.get(slots[index]) ?? pendingPrefill.get(we.exercise.id);
      return fingerprint === JSON.stringify(we) ? [[slots[index], fingerprint]] : [];
    }));
    const record = Object.keys(pending).length > 0 ? { ...workout, __pendingPrefill: pending } : workout;
    localStorage.setItem(workoutDraftKey(userId), JSON.stringify(record));
  } catch {
    // Quota / private-mode failures must never block logging a set.
  }
}

export function readWorkoutDraft(userId: string, date: string): WorkoutState | null {
  try {
    const raw = localStorage.getItem(workoutDraftKey(userId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isWorkoutState(parsed) || parsed.date !== date) return null;
    const workout = { ...parsed } as WorkoutState & { __pendingPrefill?: unknown };
    delete workout.__pendingPrefill; // Never send local provenance to cloud saves.
    return workout;
  } catch {
    return null;
  }
}

export function readPendingWorkoutPrefill(userId: string, workout: WorkoutState): Map<string, string> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(workoutDraftKey(userId)) ?? 'null');
    if (!isWorkoutState(raw) || raw.date !== workout.date) return new Map();
    const pending = (raw as WorkoutState & { __pendingPrefill?: unknown }).__pendingPrefill;
    if (!pending || typeof pending !== 'object' || Array.isArray(pending)) return new Map();
    const slots = exerciseSlotKeys(workout.exercises);
    return new Map(workout.exercises.flatMap((we, index) => {
      const fingerprint = (pending as Record<string, unknown>)[slots[index]]
        ?? (pending as Record<string, unknown>)[we.exercise.id];
      return typeof fingerprint === 'string' && fingerprint === JSON.stringify(we)
        ? [[slots[index], fingerprint] as const] : [];
    }));
  } catch {
    return new Map();
  }
}

export function clearWorkoutDraft(userId: string): void {
  try {
    localStorage.removeItem(workoutDraftKey(userId));
    const prefix = `${SOURCE_DAY_PREFIX}${userId}:`;
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(prefix)) localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage failures on cleanup.
  }
}

function workoutHasItems(workout: WorkoutState | null): boolean {
  return Boolean(workout && (workout.exercises.length > 0 || workout.cardioExercises.length > 0));
}

/**
 * Pick the in-progress workout to show after a remount.
 *
 * A leftover draft after an explicit finish must not resurrect a completed
 * session. An empty "started blank" draft must not hide a cloud workout or
 * block first-load routine seeding.
 */
export function chooseWorkoutToRestore(input: {
  cloud: WorkoutState | null;
  draft: WorkoutState | null;
  completedToday: boolean;
}): WorkoutState | null {
  const { cloud, draft, completedToday } = input;
  // In-progress local edits always win, including a second session started
  // after today's completed workout but before the cloud catch-up save.
  if (workoutHasItems(draft)) return draft;
  if (completedToday && !cloud) return null;
  if (cloud) return cloud;
  return draft;
}
