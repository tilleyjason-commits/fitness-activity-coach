import { CARDIO_EQUIPMENT } from './fittrack-cardio';
import type { Exercise } from './types';

// Machine-focused exercises commonly available at Anytime Fitness clubs.
// Based on Anytime Fitness' published equipment categories: strength machines,
// pulley/cable machines, Smith machines, and plate-loaded equipment.
// Exact equipment varies by club, so this list favors common machine movements.
export const EXERCISES: Exercise[] = [
  // Chest
  { id: 'chest-press-machine', name: 'Chest Press Machine', muscleGroup: 'Chest' },
  { id: 'incline-chest-press-machine', name: 'Incline Chest Press Machine', muscleGroup: 'Chest' },
  { id: 'decline-chest-press-machine', name: 'Decline Chest Press Machine', muscleGroup: 'Chest' },
  { id: 'plate-loaded-chest-press', name: 'Plate-Loaded Chest Press', muscleGroup: 'Chest' },
  { id: 'plate-loaded-incline-press', name: 'Plate-Loaded Incline Press', muscleGroup: 'Chest' },
  { id: 'smith-machine-bench-press', name: 'Smith Machine Bench Press', muscleGroup: 'Chest' },
  { id: 'smith-machine-incline-press', name: 'Smith Machine Incline Press', muscleGroup: 'Chest' },
  { id: 'smith-machine-decline-press', name: 'Smith Machine Decline Press', muscleGroup: 'Chest' },
  { id: 'pec-deck', name: 'Pec Deck / Machine Chest Fly', muscleGroup: 'Chest' },
  { id: 'cable-crossover', name: 'Cable Crossover', muscleGroup: 'Chest' },
  { id: 'low-to-high-cable-fly', name: 'Low-to-High Cable Fly', muscleGroup: 'Chest' },
  { id: 'high-to-low-cable-fly', name: 'High-to-Low Cable Fly', muscleGroup: 'Chest' },
  { id: 'single-arm-cable-chest-press', name: 'Single-Arm Cable Chest Press', muscleGroup: 'Chest' },
  { id: 'cable-chest-fly', name: 'Cable Chest Fly', muscleGroup: 'Chest' },

  // Back
  { id: 'lat-pulldown', name: 'Lat Pulldown', muscleGroup: 'Back' },
  { id: 'close-grip-lat-pulldown', name: 'Close-Grip Lat Pulldown', muscleGroup: 'Back' },
  { id: 'reverse-grip-lat-pulldown', name: 'Reverse-Grip Lat Pulldown', muscleGroup: 'Back' },
  { id: 'single-arm-lat-pulldown', name: 'Single-Arm Lat Pulldown', muscleGroup: 'Back' },
  { id: 'seated-cable-row', name: 'Seated Cable Row', muscleGroup: 'Back' },
  { id: 'wide-grip-seated-cable-row', name: 'Wide-Grip Seated Cable Row', muscleGroup: 'Back' },
  { id: 'single-arm-cable-row', name: 'Single-Arm Cable Row', muscleGroup: 'Back' },
  { id: 'chest-supported-row-machine', name: 'Chest-Supported Row Machine', muscleGroup: 'Back' },
  { id: 'plate-loaded-row', name: 'Plate-Loaded Row', muscleGroup: 'Back' },
  { id: 'high-row-machine', name: 'High Row Machine', muscleGroup: 'Back' },
  { id: 'low-row-machine', name: 'Low Row Machine', muscleGroup: 'Back' },
  { id: 'iso-lateral-row', name: 'Iso-Lateral Row Machine', muscleGroup: 'Back' },
  { id: 'assisted-pull-up-machine', name: 'Assisted Pull-Up Machine', muscleGroup: 'Back' },
  { id: 'cable-pullover', name: 'Cable Pullover', muscleGroup: 'Back' },
  { id: 'straight-arm-pulldown', name: 'Straight-Arm Cable Pulldown', muscleGroup: 'Back' },
  { id: 'reverse-fly-machine', name: 'Reverse Fly Machine', muscleGroup: 'Back' },
  { id: 'smith-machine-row', name: 'Smith Machine Row', muscleGroup: 'Back' },
  { id: 'smith-machine-shrug', name: 'Smith Machine Shrug', muscleGroup: 'Back' },
  { id: 'back-extension-machine', name: 'Back Extension Machine', muscleGroup: 'Back' },

  // Shoulders
  { id: 'shoulder-press-machine', name: 'Shoulder Press Machine', muscleGroup: 'Shoulders' },
  { id: 'plate-loaded-shoulder-press', name: 'Plate-Loaded Shoulder Press', muscleGroup: 'Shoulders' },
  { id: 'smith-machine-shoulder-press', name: 'Smith Machine Shoulder Press', muscleGroup: 'Shoulders' },
  { id: 'lateral-raise-machine', name: 'Lateral Raise Machine', muscleGroup: 'Shoulders' },
  { id: 'cable-lateral-raise', name: 'Cable Lateral Raise', muscleGroup: 'Shoulders' },
  { id: 'single-arm-cable-lateral-raise', name: 'Single-Arm Cable Lateral Raise', muscleGroup: 'Shoulders' },
  { id: 'cable-front-raise', name: 'Cable Front Raise', muscleGroup: 'Shoulders' },
  { id: 'cable-upright-row', name: 'Cable Upright Row', muscleGroup: 'Shoulders' },
  { id: 'rear-delt-fly-machine', name: 'Rear Delt Fly Machine', muscleGroup: 'Shoulders' },
  { id: 'cable-rear-delt-fly', name: 'Cable Rear Delt Fly', muscleGroup: 'Shoulders' },
  { id: 'face-pull', name: 'Cable Face Pull', muscleGroup: 'Shoulders' },

  // Arms
  { id: 'bicep-curl-machine', name: 'Bicep Curl Machine', muscleGroup: 'Arms' },
  { id: 'preacher-curl-machine', name: 'Preacher Curl Machine', muscleGroup: 'Arms' },
  { id: 'cable-bicep-curl', name: 'Cable Bicep Curl', muscleGroup: 'Arms' },
  { id: 'straight-bar-cable-curl', name: 'Straight-Bar Cable Curl', muscleGroup: 'Arms' },
  { id: 'rope-cable-curl', name: 'Rope Cable Curl', muscleGroup: 'Arms' },
  { id: 'single-arm-cable-curl', name: 'Single-Arm Cable Curl', muscleGroup: 'Arms' },
  { id: 'cable-hammer-curl', name: 'Cable Hammer Curl', muscleGroup: 'Arms' },
  { id: 'bayesian-cable-curl', name: 'Bayesian Cable Curl', muscleGroup: 'Arms' },
  { id: 'tricep-pushdown', name: 'Tricep Pushdown (Cable)', muscleGroup: 'Arms' },
  { id: 'rope-tricep-pushdown', name: 'Rope Tricep Pushdown', muscleGroup: 'Arms' },
  { id: 'single-arm-cable-pushdown', name: 'Single-Arm Cable Pushdown', muscleGroup: 'Arms' },
  { id: 'overhead-cable-tricep-extension', name: 'Overhead Cable Tricep Extension', muscleGroup: 'Arms' },
  { id: 'tricep-extension-machine', name: 'Tricep Extension Machine', muscleGroup: 'Arms' },
  { id: 'assisted-dip-machine', name: 'Assisted Dip Machine', muscleGroup: 'Arms' },
  { id: 'cable-wrist-curl', name: 'Cable Wrist Curl', muscleGroup: 'Arms' },
  { id: 'cable-reverse-wrist-curl', name: 'Cable Reverse Wrist Curl', muscleGroup: 'Arms' },

  // Legs
  { id: 'leg-press', name: 'Leg Press', muscleGroup: 'Legs' },
  { id: 'horizontal-leg-press', name: 'Horizontal Leg Press', muscleGroup: 'Legs' },
  { id: 'forty-five-degree-leg-press', name: '45° Leg Press', muscleGroup: 'Legs' },
  { id: 'single-leg-press', name: 'Single-Leg Leg Press', muscleGroup: 'Legs' },
  { id: 'hack-squat', name: 'Hack Squat Machine', muscleGroup: 'Legs' },
  { id: 'pendulum-squat-machine', name: 'Pendulum Squat Machine', muscleGroup: 'Legs' },
  { id: 'v-squat-machine', name: 'V-Squat Machine', muscleGroup: 'Legs' },
  { id: 'smith-machine-squat', name: 'Smith Machine Squat', muscleGroup: 'Legs' },
  { id: 'smith-machine-front-squat', name: 'Smith Machine Front Squat', muscleGroup: 'Legs' },
  { id: 'smith-machine-split-squat', name: 'Smith Machine Split Squat', muscleGroup: 'Legs' },
  { id: 'smith-machine-lunge', name: 'Smith Machine Lunge', muscleGroup: 'Legs' },
  { id: 'leg-extension', name: 'Leg Extension', muscleGroup: 'Legs' },
  { id: 'single-leg-extension', name: 'Single-Leg Leg Extension', muscleGroup: 'Legs' },
  { id: 'seated-leg-curl', name: 'Seated Leg Curl', muscleGroup: 'Legs' },
  { id: 'lying-leg-curl', name: 'Lying Leg Curl', muscleGroup: 'Legs' },
  { id: 'standing-leg-curl', name: 'Standing Leg Curl', muscleGroup: 'Legs' },
  { id: 'single-leg-curl', name: 'Single-Leg Leg Curl', muscleGroup: 'Legs' },
  { id: 'hip-adductor', name: 'Hip Adductor Machine', muscleGroup: 'Legs' },
  { id: 'hip-abductor', name: 'Hip Abductor Machine', muscleGroup: 'Legs' },
  { id: 'seated-calf-raise-machine', name: 'Seated Calf Raise Machine', muscleGroup: 'Legs' },
  { id: 'standing-calf-raise-machine', name: 'Standing Calf Raise Machine', muscleGroup: 'Legs' },
  { id: 'leg-press-calf-raise', name: 'Leg Press Calf Raise', muscleGroup: 'Legs' },
  { id: 'smith-machine-calf-raise', name: 'Smith Machine Calf Raise', muscleGroup: 'Legs' },
  { id: 'tibialis-raise-machine', name: 'Tibialis Raise Machine', muscleGroup: 'Legs' },

  // Glutes
  { id: 'hip-thrust-machine', name: 'Hip Thrust Machine', muscleGroup: 'Glutes' },
  { id: 'glute-drive-machine', name: 'Glute Drive Machine', muscleGroup: 'Glutes' },
  { id: 'smith-machine-hip-thrust', name: 'Smith Machine Hip Thrust', muscleGroup: 'Glutes' },
  { id: 'cable-glute-kickback', name: 'Cable Glute Kickback', muscleGroup: 'Glutes' },
  { id: 'cable-pull-through', name: 'Cable Pull-Through', muscleGroup: 'Glutes' },
  { id: 'glute-kickback-machine', name: 'Glute Kickback Machine', muscleGroup: 'Glutes' },
  { id: 'multi-hip-extension-machine', name: 'Multi-Hip Extension Machine', muscleGroup: 'Glutes' },
  { id: 'machine-hip-abduction', name: 'Machine Hip Abduction', muscleGroup: 'Glutes' },
  { id: 'machine-hip-adduction', name: 'Machine Hip Adduction', muscleGroup: 'Glutes' },

  // Core
  { id: 'ab-crunch-machine', name: 'Ab Crunch Machine', muscleGroup: 'Core' },
  { id: 'cable-crunch', name: 'Cable Crunch', muscleGroup: 'Core' },
  { id: 'kneeling-cable-crunch', name: 'Kneeling Cable Crunch', muscleGroup: 'Core' },
  { id: 'standing-cable-crunch', name: 'Standing Cable Crunch', muscleGroup: 'Core' },
  { id: 'rotary-torso', name: 'Rotary Torso Machine', muscleGroup: 'Core' },
  { id: 'cable-woodchop', name: 'Cable Woodchop', muscleGroup: 'Core' },
  { id: 'cable-lift', name: 'Cable Lift', muscleGroup: 'Core' },
  { id: 'pallof-press', name: 'Cable Pallof Press', muscleGroup: 'Core' },
  { id: 'captains-chair-knee-raise', name: "Captain's Chair Knee Raise", muscleGroup: 'Core' },
  { id: 'captains-chair-leg-raise', name: "Captain's Chair Leg Raise", muscleGroup: 'Core' },
  { id: 'roman-chair-back-extension', name: 'Roman Chair Back Extension', muscleGroup: 'Core' },
];

export const MUSCLE_GROUPS = [...new Set(EXERCISES.map((e) => e.muscleGroup))];

/** Selector groups: one tab per muscle group, plus a Cardio tab. */
export const CARDIO_GROUP = 'Cardio';
export const SELECTOR_GROUPS = [...MUSCLE_GROUPS, CARDIO_GROUP];

export function getSelectorItems(group: string) {
  if (group === CARDIO_GROUP) return CARDIO_EQUIPMENT;
  return EXERCISES.filter((exercise) => exercise.muscleGroup === group);
}

export function isCardioGroup(group: string) {
  return group === CARDIO_GROUP;
}
