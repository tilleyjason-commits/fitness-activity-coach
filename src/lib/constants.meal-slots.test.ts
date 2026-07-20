import { describe, expect, it } from 'vitest';
import {
  MEAL_SLOTS,
  MEAL_SLOT_ICONS,
  MEAL_SLOT_LABELS,
  MEAL_SLOT_TIMES,
  MEAL_TIMING,
} from '~/lib/constants';

/**
 * Canonical meal-slot contract: seven slots in the approved render order, each
 * with complete label/icon/time metadata. The two new slots reuse the
 * MEAL_TIMING schedule constants so the plan stays defined in one place.
 */

const APPROVED_ORDER = [
  'breakfast',
  'pre_workout_snack',
  'lunch',
  'post_gym',
  'snack',
  'dinner',
  'bedtime_snack',
];

describe('canonical meal slots', () => {
  it('has exactly seven canonical slot identifiers', () => {
    expect(MEAL_SLOTS).toHaveLength(7);
    expect(new Set(MEAL_SLOTS).size).toBe(7);
  });

  it('renders in the exact approved order', () => {
    expect(MEAL_SLOTS).toEqual(APPROVED_ORDER);
  });

  it('labels the new slots Pre-Workout Snack and Bedtime Snack', () => {
    expect(MEAL_SLOT_LABELS.pre_workout_snack).toBe(
      'Pre-Workout Snack',
    );
    expect(MEAL_SLOT_LABELS.bedtime_snack).toBe('Bedtime Snack');
  });

  it('ties the new slot times to the MEAL_TIMING schedule constants', () => {
    expect(MEAL_SLOT_TIMES.pre_workout_snack.start).toBe(
      MEAL_TIMING.preGymSnack,
    );
    expect(MEAL_SLOT_TIMES.bedtime_snack.start).toBe(
      MEAL_TIMING.casein,
    );
  });

  it('gives the new slots their approved hints', () => {
    expect(MEAL_SLOT_TIMES.pre_workout_snack.hint).toBe(
      'Fuel ~45 min before 11:00 training',
    );
    expect(MEAL_SLOT_TIMES.bedtime_snack.hint).toBe(
      'Pre-sleep protein / casein (~20:00)',
    );
  });

  it('no longer mentions pre-workout in the breakfast hint', () => {
    expect(MEAL_SLOT_TIMES.breakfast.hint).not.toMatch(/pre[- ]?workout/i);
    expect(MEAL_SLOT_TIMES.breakfast.hint).toBe('Morning meal');
  });

  it('moves post-gym to 12:15 in both time and hint', () => {
    expect(MEAL_SLOT_TIMES.post_gym.start).toBe('12:15');
    expect(MEAL_SLOT_TIMES.post_gym.hint).toBe('After training (~12:15)');
  });

  it('provides complete label/icon/time metadata for every slot', () => {
    for (const slot of MEAL_SLOTS) {
      expect(MEAL_SLOT_LABELS[slot], `label for ${slot}`).toBeTruthy();
      expect(MEAL_SLOT_ICONS[slot], `icon for ${slot}`).toBeTruthy();
      expect(MEAL_SLOT_TIMES[slot]?.start, `start for ${slot}`).toMatch(/^\d{2}:\d{2}$/);
      expect(MEAL_SLOT_TIMES[slot]?.hint, `hint for ${slot}`).toBeTruthy();
    }
  });
});
