/**
 * Immediate local snapshot of an in-progress workout.
 *
 * Cloud autosave is debounced and discarded on unmount. Mobile window switches
 * (Safari/PWA token refresh, tab eviction) remount TrainingPage before that
 * save lands, so the latest sets must live in localStorage first.
 */
import type { WorkoutState } from './types';

const DRAFT_PREFIX = 'fac-workout-draft-v1:';

export function workoutDraftKey(userId: string): string {
  return `${DRAFT_PREFIX}${userId}`;
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

export function persistWorkoutDraft(userId: string, workout: WorkoutState): void {
  try {
    localStorage.setItem(workoutDraftKey(userId), JSON.stringify(workout));
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
    return parsed;
  } catch {
    return null;
  }
}

export function clearWorkoutDraft(userId: string): void {
  try {
    localStorage.removeItem(workoutDraftKey(userId));
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
