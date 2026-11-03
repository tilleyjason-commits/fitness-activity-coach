import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearPrefilledExercises,
  markExercisesPrefilled,
  readPrefilledExerciseIds,
} from '~/lib/previous-session-prefill';

describe('previous-session prefill marker', () => {
  beforeEach(() => localStorage.clear());

  it('accumulates ids per user and date', () => {
    markExercisesPrefilled('u1', '2026-11-02', ['bench']);
    markExercisesPrefilled('u1', '2026-11-02', ['row']);
    expect([...readPrefilledExerciseIds('u1', '2026-11-02')].sort()).toEqual(['bench', 'row']);
    expect(readPrefilledExerciseIds('u2', '2026-11-02').size).toBe(0);
    expect(readPrefilledExerciseIds('u1', '2026-11-03').size).toBe(0);
  });

  it('clears and survives corrupted storage', () => {
    markExercisesPrefilled('u1', '2026-11-02', ['bench']);
    clearPrefilledExercises('u1', '2026-11-02');
    expect(readPrefilledExerciseIds('u1', '2026-11-02').size).toBe(0);
    localStorage.setItem('fac-prefilled-v1:u1:2026-11-02', '{nope');
    expect(readPrefilledExerciseIds('u1', '2026-11-02').size).toBe(0);
  });
});
