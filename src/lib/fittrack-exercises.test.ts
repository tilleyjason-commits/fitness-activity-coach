import { describe, expect, it } from 'vitest';
import { EXERCISES, getSelectorItems } from '~/lib/fittrack-exercises';

const LEGACY_EXERCISE_IDS = [
  'chest-press-machine',
  'incline-chest-press-machine',
  'decline-chest-press-machine',
  'plate-loaded-chest-press',
  'plate-loaded-incline-press',
  'smith-machine-bench-press',
  'smith-machine-incline-press',
  'smith-machine-decline-press',
  'pec-deck',
  'cable-crossover',
  'low-to-high-cable-fly',
  'high-to-low-cable-fly',
  'single-arm-cable-chest-press',
  'cable-chest-fly',
  'lat-pulldown',
  'close-grip-lat-pulldown',
  'reverse-grip-lat-pulldown',
  'single-arm-lat-pulldown',
  'seated-cable-row',
  'wide-grip-seated-cable-row',
  'single-arm-cable-row',
  'chest-supported-row-machine',
  'plate-loaded-row',
  'high-row-machine',
  'low-row-machine',
  'iso-lateral-row',
  'assisted-pull-up-machine',
  'cable-pullover',
  'straight-arm-pulldown',
  'reverse-fly-machine',
  'smith-machine-row',
  'smith-machine-shrug',
  'back-extension-machine',
  'shoulder-press-machine',
  'plate-loaded-shoulder-press',
  'smith-machine-shoulder-press',
  'lateral-raise-machine',
  'cable-lateral-raise',
  'single-arm-cable-lateral-raise',
  'cable-front-raise',
  'cable-upright-row',
  'rear-delt-fly-machine',
  'cable-rear-delt-fly',
  'face-pull',
  'bicep-curl-machine',
  'preacher-curl-machine',
  'cable-bicep-curl',
  'straight-bar-cable-curl',
  'rope-cable-curl',
  'single-arm-cable-curl',
  'cable-hammer-curl',
  'bayesian-cable-curl',
  'tricep-pushdown',
  'rope-tricep-pushdown',
  'single-arm-cable-pushdown',
  'overhead-cable-tricep-extension',
  'tricep-extension-machine',
  'assisted-dip-machine',
  'cable-wrist-curl',
  'cable-reverse-wrist-curl',
  'leg-press',
  'horizontal-leg-press',
  'forty-five-degree-leg-press',
  'single-leg-press',
  'hack-squat',
  'pendulum-squat-machine',
  'v-squat-machine',
  'smith-machine-squat',
  'smith-machine-front-squat',
  'smith-machine-split-squat',
  'smith-machine-lunge',
  'leg-extension',
  'single-leg-extension',
  'seated-leg-curl',
  'lying-leg-curl',
  'standing-leg-curl',
  'single-leg-curl',
  'hip-adductor',
  'hip-abductor',
  'seated-calf-raise-machine',
  'standing-calf-raise-machine',
  'leg-press-calf-raise',
  'smith-machine-calf-raise',
  'tibialis-raise-machine',
  'hip-thrust-machine',
  'glute-drive-machine',
  'smith-machine-hip-thrust',
  'cable-glute-kickback',
  'cable-pull-through',
  'glute-kickback-machine',
  'multi-hip-extension-machine',
  'machine-hip-abduction',
  'machine-hip-adduction',
  'ab-crunch-machine',
  'cable-crunch',
  'kneeling-cable-crunch',
  'standing-cable-crunch',
  'rotary-torso',
  'cable-woodchop',
  'cable-lift',
  'pallof-press',
  'captains-chair-knee-raise',
  'captains-chair-leg-raise',
  'roman-chair-back-extension',
] as const;

const REQUIRED_COMMERCIAL_GYM_EXERCISES = [
  'Barbell Bench Press',
  'Dumbbell Bench Press',
  'Barbell Back Squat',
  'Barbell Front Squat',
  'Conventional Barbell Deadlift',
  'Barbell Romanian Deadlift',
  'Barbell Bent-Over Row',
  'One-Arm Dumbbell Row',
  'Pull-Up',
  'Parallel-Bar Dip',
  'Kettlebell Swing',
  'Landmine Row',
  'Trap-Bar Deadlift',
  'Sled Push',
  'Farmer Carry',
] as const;

describe('commercial-gym exercise catalog', () => {
  it('provides broad coverage without breaking legacy exercise IDs', () => {
    const ids = EXERCISES.map((exercise) => exercise.id);
    const names = EXERCISES.map((exercise) => exercise.name);

    expect(EXERCISES.length).toBeGreaterThanOrEqual(220);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);

    for (const id of LEGACY_EXERCISE_IDS) expect(ids).toContain(id);
    for (const name of REQUIRED_COMMERCIAL_GYM_EXERCISES) expect(names).toContain(name);
  });

  it('tags every exercise with a useful commercial-gym equipment family', () => {
    const equipment = EXERCISES.map((exercise) => exercise.equipment);

    expect(equipment.every(Boolean)).toBe(true);
    for (const requiredEquipment of [
      'Machine',
      'Cable',
      'Dumbbell',
      'Barbell',
      'EZ Bar',
      'Smith Machine',
      'Bodyweight',
      'Kettlebell',
      'Landmine',
      'Resistance Band',
      'Trap Bar',
      'Sled',
      'Medicine Ball',
      'Other',
    ]) {
      expect(equipment).toContain(requiredEquipment);
    }

    const counts = equipment.reduce<Record<string, number>>((acc, item) => {
      if (item) acc[item] = (acc[item] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts['Trap Bar']).toBeGreaterThanOrEqual(3);
    expect(counts.Sled).toBeGreaterThanOrEqual(3);
    expect(counts['Medicine Ball']).toBeGreaterThanOrEqual(4);
  });

  it('supports global search combined with an equipment filter', () => {
    const dumbbellBenchPresses = getSelectorItems('All', {
      query: 'bench press',
      equipment: 'Dumbbell',
    });

    expect(dumbbellBenchPresses.map((exercise) => exercise.name)).toEqual([
      'Dumbbell Bench Press',
      'Incline Dumbbell Bench Press',
      'Decline Dumbbell Bench Press',
      'Neutral-Grip Dumbbell Bench Press',
    ]);
    expect(
      dumbbellBenchPresses.every(
        (exercise) => 'equipment' in exercise && exercise.equipment === 'Dumbbell',
      ),
    ).toBe(true);
  });
});
