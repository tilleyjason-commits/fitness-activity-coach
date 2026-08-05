import { describe, expect, it } from 'vitest';
import { suggestNextSet } from '~/lib/workout-mappers';

describe('suggestNextSet', () => {
  it('returns null with no prior set to compare against', () => {
    expect(suggestNextSet(null)).toBeNull();
  });

  it('suggests one more rep at the same weight when RIR left room', () => {
    expect(suggestNextSet({ reps: 10, weight: 185, rir: 2 })).toEqual({
      reps: 11,
      weight: 185,
    });
  });

  it('suggests one more rep when RIR was not logged', () => {
    expect(suggestNextSet({ reps: 8, weight: 135, rir: null })).toEqual({
      reps: 9,
      weight: 135,
    });
  });

  it('suggests a weight step (same reps) once last time was at or near failure', () => {
    expect(suggestNextSet({ reps: 10, weight: 185, rir: 1 })).toEqual({
      reps: 10,
      weight: 190,
    });
    expect(suggestNextSet({ reps: 10, weight: 185, rir: 0 })).toEqual({
      reps: 10,
      weight: 190,
    });
  });
});
