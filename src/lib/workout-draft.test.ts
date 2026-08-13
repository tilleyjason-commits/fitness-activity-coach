import { beforeEach, describe, expect, it } from 'vitest';
import {
  chooseWorkoutToRestore,
  clearWorkoutDraft,
  persistWorkoutDraft,
  readWorkoutDraft,
} from '~/lib/workout-draft';
import type { WorkoutState } from '~/lib/types';

const today = '2026-08-13';

function workout(overrides: Partial<WorkoutState> = {}): WorkoutState {
  return {
    date: today,
    exercises: [
      {
        exercise: { id: 'bench-press', name: 'Bench Press', muscleGroup: 'Chest' },
        targetSets: 2,
        targetReps: 8,
        targetWeight: 185,
        sets: [
          { reps: 8, weight: 185, rir: 2, completed: true },
          { reps: 8, weight: 185, rir: null, completed: false },
        ],
      },
    ],
    cardioExercises: [],
    ...overrides,
  };
}

describe('workout draft persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips a draft for the same user and date', () => {
    persistWorkoutDraft('user-abc', workout());
    expect(readWorkoutDraft('user-abc', today)?.exercises[0]?.sets[0]?.completed).toBe(true);
  });

  it('ignores a draft saved for a different date', () => {
    persistWorkoutDraft('user-abc', workout({ date: '2026-08-12' }));
    expect(readWorkoutDraft('user-abc', today)).toBeNull();
  });

  it('does not leak one user draft to another user', () => {
    persistWorkoutDraft('user-abc', workout());
    expect(readWorkoutDraft('user-other', today)).toBeNull();
  });

  it('survives corrupted localStorage without throwing', () => {
    localStorage.setItem('fac-workout-draft-v1:user-abc', '{not-json');
    expect(readWorkoutDraft('user-abc', today)).toBeNull();
  });

  it('clears the stored draft', () => {
    persistWorkoutDraft('user-abc', workout());
    clearWorkoutDraft('user-abc');
    expect(readWorkoutDraft('user-abc', today)).toBeNull();
  });
});

describe('chooseWorkoutToRestore', () => {
  const draft = workout();
  const cloud = workout({
    exercises: [
      {
        exercise: { id: 'bench-press', name: 'Bench Press', muscleGroup: 'Chest' },
        targetSets: 2,
        targetReps: 8,
        targetWeight: 185,
        sets: [
          { reps: 8, weight: 185, rir: null, completed: false },
          { reps: 8, weight: 185, rir: null, completed: false },
        ],
      },
    ],
  });

  it('prefers the local draft over a stale cloud snapshot', () => {
    expect(chooseWorkoutToRestore({ cloud, draft, completedToday: false })).toBe(draft);
  });

  it('uses the draft when the cloud has not caught up yet', () => {
    expect(chooseWorkoutToRestore({ cloud: null, draft, completedToday: false })).toBe(draft);
  });

  it('does not resurrect an empty leftover draft after the workout was finished', () => {
    const empty = workout({ exercises: [], cardioExercises: [] });
    expect(chooseWorkoutToRestore({ cloud: null, draft: empty, completedToday: true })).toBeNull();
  });

  it('keeps a second-session draft after a completed workout if cloud has an active one', () => {
    expect(chooseWorkoutToRestore({ cloud, draft, completedToday: true })).toBe(draft);
  });

  it('falls back to cloud when no draft exists', () => {
    expect(chooseWorkoutToRestore({ cloud, draft: null, completedToday: false })).toBe(cloud);
  });

  it('does not let an empty started-blank draft hide a cloud workout', () => {
    const empty = workout({ exercises: [], cardioExercises: [] });
    expect(chooseWorkoutToRestore({ cloud, draft: empty, completedToday: false })).toBe(cloud);
  });
});
