import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TARGETS,
  getMealSlotTimes,
  resolveMealTiming,
  resolveTargets,
} from '~/lib/constants';
import type { Profile } from '~/lib/types';

const baseProfile = (overrides: Partial<Profile> = {}): Profile => ({
  id: 'u1',
  user_id: 'u1',
  age: 40,
  height_cm: 175,
  weight_lb: 190,
  bodyfat_pct: 22,
  goal_bodyfat_pct: 15,
  goal_weight_lb: 175,
  training_years: 3,
  training_time: '06:30:00',
  ...overrides,
});

describe('resolveTargets', () => {
  it('falls back to default athlete targets when profile is null', () => {
    expect(resolveTargets(null)).toEqual(DEFAULT_TARGETS);
  });

  it('scales calorie and protein bands from profile weight and goals', () => {
    const targets = resolveTargets(baseProfile({ weight_lb: 200, goal_weight_lb: 180 }));
    // Protein ~1.0 g/lb bodyweight, calories leaner when goal < current.
    expect(targets.proteinG).toBeGreaterThanOrEqual(180);
    expect(targets.proteinMinG).toBeLessThanOrEqual(targets.proteinG);
    expect(targets.proteinMaxG).toBeGreaterThanOrEqual(targets.proteinG);
    expect(targets.caloriesMin).toBeLessThan(targets.calories);
    expect(targets.caloriesMax).toBeGreaterThan(targets.calories);
  });
});

describe('resolveMealTiming', () => {
  it('anchors pre/post gym slots to the profile training time', () => {
    const timing = resolveMealTiming(baseProfile({ training_time: '11:00:00' }));
    expect(timing.training).toBe('11:00');
    expect(timing.preGymSnack).toBe('10:15');
    expect(timing.postGymMeal).toBe('12:15');
  });

  it('rebuilds meal slot hints from resolved timing', () => {
    const timing = resolveMealTiming(baseProfile({ training_time: '07:00:00' }));
    const slots = getMealSlotTimes(timing);
    expect(slots.pre_workout_snack.start).toBe(timing.preGymSnack);
    expect(slots.pre_workout_snack.hint).toContain(timing.training);
    expect(slots.post_gym.start).toBe(timing.postGymMeal);
  });
});
