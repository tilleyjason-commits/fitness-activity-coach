import { CARDIO_EQUIPMENT } from './fittrack-cardio';
import type { Exercise, ExerciseEquipment } from './types';

// Broad commercial-gym catalog grounded in ExRx movement/equipment directories
// and common machine, cable, free-weight, functional, and bodyweight stations.
// Exact equipment varies by gym and location.
export const EXERCISES: Exercise[] = [
  // Chest
  { id: 'chest-press-machine', name: 'Chest Press Machine', muscleGroup: 'Chest', equipment: 'Machine' },
  { id: 'incline-chest-press-machine', name: 'Incline Chest Press Machine', muscleGroup: 'Chest', equipment: 'Machine' },
  { id: 'decline-chest-press-machine', name: 'Decline Chest Press Machine', muscleGroup: 'Chest', equipment: 'Machine' },
  { id: 'plate-loaded-chest-press', name: 'Plate-Loaded Chest Press', muscleGroup: 'Chest', equipment: 'Machine' },
  { id: 'plate-loaded-incline-press', name: 'Plate-Loaded Incline Press', muscleGroup: 'Chest', equipment: 'Machine' },
  { id: 'smith-machine-bench-press', name: 'Smith Machine Bench Press', muscleGroup: 'Chest', equipment: 'Smith Machine' },
  { id: 'smith-machine-incline-press', name: 'Smith Machine Incline Press', muscleGroup: 'Chest', equipment: 'Smith Machine' },
  { id: 'smith-machine-decline-press', name: 'Smith Machine Decline Press', muscleGroup: 'Chest', equipment: 'Smith Machine' },
  { id: 'pec-deck', name: 'Pec Deck / Machine Chest Fly', muscleGroup: 'Chest', equipment: 'Machine' },
  { id: 'cable-crossover', name: 'Cable Crossover', muscleGroup: 'Chest', equipment: 'Cable' },
  { id: 'low-to-high-cable-fly', name: 'Low-to-High Cable Fly', muscleGroup: 'Chest', equipment: 'Cable' },
  { id: 'high-to-low-cable-fly', name: 'High-to-Low Cable Fly', muscleGroup: 'Chest', equipment: 'Cable' },
  { id: 'single-arm-cable-chest-press', name: 'Single-Arm Cable Chest Press', muscleGroup: 'Chest', equipment: 'Cable' },
  { id: 'cable-chest-fly', name: 'Cable Chest Fly', muscleGroup: 'Chest', equipment: 'Cable' },

  // Back
  { id: 'lat-pulldown', name: 'Lat Pulldown', muscleGroup: 'Back', equipment: 'Cable' },
  { id: 'close-grip-lat-pulldown', name: 'Close-Grip Lat Pulldown', muscleGroup: 'Back', equipment: 'Cable' },
  { id: 'reverse-grip-lat-pulldown', name: 'Reverse-Grip Lat Pulldown', muscleGroup: 'Back', equipment: 'Cable' },
  { id: 'single-arm-lat-pulldown', name: 'Single-Arm Lat Pulldown', muscleGroup: 'Back', equipment: 'Cable' },
  { id: 'seated-cable-row', name: 'Seated Cable Row', muscleGroup: 'Back', equipment: 'Cable' },
  { id: 'wide-grip-seated-cable-row', name: 'Wide-Grip Seated Cable Row', muscleGroup: 'Back', equipment: 'Cable' },
  { id: 'single-arm-cable-row', name: 'Single-Arm Cable Row', muscleGroup: 'Back', equipment: 'Cable' },
  { id: 'chest-supported-row-machine', name: 'Chest-Supported Row Machine', muscleGroup: 'Back', equipment: 'Machine' },
  { id: 'plate-loaded-row', name: 'Plate-Loaded Row', muscleGroup: 'Back', equipment: 'Machine' },
  { id: 'high-row-machine', name: 'High Row Machine', muscleGroup: 'Back', equipment: 'Machine' },
  { id: 'low-row-machine', name: 'Low Row Machine', muscleGroup: 'Back', equipment: 'Machine' },
  { id: 'iso-lateral-row', name: 'Iso-Lateral Row Machine', muscleGroup: 'Back', equipment: 'Machine' },
  { id: 'assisted-pull-up-machine', name: 'Assisted Pull-Up Machine', muscleGroup: 'Back', equipment: 'Assisted' },
  { id: 'cable-pullover', name: 'Cable Pullover', muscleGroup: 'Back', equipment: 'Cable' },
  { id: 'straight-arm-pulldown', name: 'Straight-Arm Cable Pulldown', muscleGroup: 'Back', equipment: 'Cable' },
  { id: 'reverse-fly-machine', name: 'Reverse Fly Machine', muscleGroup: 'Back', equipment: 'Machine' },
  { id: 'smith-machine-row', name: 'Smith Machine Row', muscleGroup: 'Back', equipment: 'Smith Machine' },
  { id: 'smith-machine-shrug', name: 'Smith Machine Shrug', muscleGroup: 'Back', equipment: 'Smith Machine' },
  { id: 'back-extension-machine', name: 'Back Extension Machine', muscleGroup: 'Back', equipment: 'Machine' },

  // Shoulders
  { id: 'shoulder-press-machine', name: 'Shoulder Press Machine', muscleGroup: 'Shoulders', equipment: 'Machine' },
  { id: 'plate-loaded-shoulder-press', name: 'Plate-Loaded Shoulder Press', muscleGroup: 'Shoulders', equipment: 'Machine' },
  { id: 'smith-machine-shoulder-press', name: 'Smith Machine Shoulder Press', muscleGroup: 'Shoulders', equipment: 'Smith Machine' },
  { id: 'lateral-raise-machine', name: 'Lateral Raise Machine', muscleGroup: 'Shoulders', equipment: 'Machine' },
  { id: 'cable-lateral-raise', name: 'Cable Lateral Raise', muscleGroup: 'Shoulders', equipment: 'Cable' },
  { id: 'single-arm-cable-lateral-raise', name: 'Single-Arm Cable Lateral Raise', muscleGroup: 'Shoulders', equipment: 'Cable' },
  { id: 'cable-front-raise', name: 'Cable Front Raise', muscleGroup: 'Shoulders', equipment: 'Cable' },
  { id: 'cable-upright-row', name: 'Cable Upright Row', muscleGroup: 'Shoulders', equipment: 'Cable' },
  { id: 'rear-delt-fly-machine', name: 'Rear Delt Fly Machine', muscleGroup: 'Shoulders', equipment: 'Machine' },
  { id: 'cable-rear-delt-fly', name: 'Cable Rear Delt Fly', muscleGroup: 'Shoulders', equipment: 'Cable' },
  { id: 'face-pull', name: 'Cable Face Pull', muscleGroup: 'Shoulders', equipment: 'Cable' },

  // Arms
  { id: 'bicep-curl-machine', name: 'Bicep Curl Machine', muscleGroup: 'Arms', equipment: 'Machine' },
  { id: 'preacher-curl-machine', name: 'Preacher Curl Machine', muscleGroup: 'Arms', equipment: 'Machine' },
  { id: 'cable-bicep-curl', name: 'Cable Bicep Curl', muscleGroup: 'Arms', equipment: 'Cable' },
  { id: 'straight-bar-cable-curl', name: 'Straight-Bar Cable Curl', muscleGroup: 'Arms', equipment: 'Cable' },
  { id: 'rope-cable-curl', name: 'Rope Cable Curl', muscleGroup: 'Arms', equipment: 'Cable' },
  { id: 'single-arm-cable-curl', name: 'Single-Arm Cable Curl', muscleGroup: 'Arms', equipment: 'Cable' },
  { id: 'cable-hammer-curl', name: 'Cable Hammer Curl', muscleGroup: 'Arms', equipment: 'Cable' },
  { id: 'bayesian-cable-curl', name: 'Bayesian Cable Curl', muscleGroup: 'Arms', equipment: 'Cable' },
  { id: 'tricep-pushdown', name: 'Tricep Pushdown (Cable)', muscleGroup: 'Arms', equipment: 'Cable' },
  { id: 'rope-tricep-pushdown', name: 'Rope Tricep Pushdown', muscleGroup: 'Arms', equipment: 'Cable' },
  { id: 'single-arm-cable-pushdown', name: 'Single-Arm Cable Pushdown', muscleGroup: 'Arms', equipment: 'Cable' },
  { id: 'overhead-cable-tricep-extension', name: 'Overhead Cable Tricep Extension', muscleGroup: 'Arms', equipment: 'Cable' },
  { id: 'tricep-extension-machine', name: 'Tricep Extension Machine', muscleGroup: 'Arms', equipment: 'Machine' },
  { id: 'assisted-dip-machine', name: 'Assisted Dip Machine', muscleGroup: 'Arms', equipment: 'Assisted' },
  { id: 'cable-wrist-curl', name: 'Cable Wrist Curl', muscleGroup: 'Arms', equipment: 'Cable' },
  { id: 'cable-reverse-wrist-curl', name: 'Cable Reverse Wrist Curl', muscleGroup: 'Arms', equipment: 'Cable' },

  // Legs
  { id: 'leg-press', name: 'Leg Press', muscleGroup: 'Legs', equipment: 'Machine' },
  { id: 'horizontal-leg-press', name: 'Horizontal Leg Press', muscleGroup: 'Legs', equipment: 'Machine' },
  { id: 'forty-five-degree-leg-press', name: '45° Leg Press', muscleGroup: 'Legs', equipment: 'Machine' },
  { id: 'single-leg-press', name: 'Single-Leg Leg Press', muscleGroup: 'Legs', equipment: 'Machine' },
  { id: 'hack-squat', name: 'Hack Squat Machine', muscleGroup: 'Legs', equipment: 'Machine' },
  { id: 'pendulum-squat-machine', name: 'Pendulum Squat Machine', muscleGroup: 'Legs', equipment: 'Machine' },
  { id: 'v-squat-machine', name: 'V-Squat Machine', muscleGroup: 'Legs', equipment: 'Machine' },
  { id: 'smith-machine-squat', name: 'Smith Machine Squat', muscleGroup: 'Legs', equipment: 'Smith Machine' },
  { id: 'smith-machine-front-squat', name: 'Smith Machine Front Squat', muscleGroup: 'Legs', equipment: 'Smith Machine' },
  { id: 'smith-machine-split-squat', name: 'Smith Machine Split Squat', muscleGroup: 'Legs', equipment: 'Smith Machine' },
  { id: 'smith-machine-lunge', name: 'Smith Machine Lunge', muscleGroup: 'Legs', equipment: 'Smith Machine' },
  { id: 'leg-extension', name: 'Leg Extension', muscleGroup: 'Legs', equipment: 'Machine' },
  { id: 'single-leg-extension', name: 'Single-Leg Leg Extension', muscleGroup: 'Legs', equipment: 'Machine' },
  { id: 'seated-leg-curl', name: 'Seated Leg Curl', muscleGroup: 'Legs', equipment: 'Machine' },
  { id: 'lying-leg-curl', name: 'Lying Leg Curl', muscleGroup: 'Legs', equipment: 'Machine' },
  { id: 'standing-leg-curl', name: 'Standing Leg Curl', muscleGroup: 'Legs', equipment: 'Machine' },
  { id: 'single-leg-curl', name: 'Single-Leg Leg Curl', muscleGroup: 'Legs', equipment: 'Machine' },
  { id: 'hip-adductor', name: 'Hip Adductor Machine', muscleGroup: 'Legs', equipment: 'Machine' },
  { id: 'hip-abductor', name: 'Hip Abductor Machine', muscleGroup: 'Legs', equipment: 'Machine' },
  { id: 'seated-calf-raise-machine', name: 'Seated Calf Raise Machine', muscleGroup: 'Legs', equipment: 'Machine' },
  { id: 'standing-calf-raise-machine', name: 'Standing Calf Raise Machine', muscleGroup: 'Legs', equipment: 'Machine' },
  { id: 'leg-press-calf-raise', name: 'Leg Press Calf Raise', muscleGroup: 'Legs', equipment: 'Machine' },
  { id: 'smith-machine-calf-raise', name: 'Smith Machine Calf Raise', muscleGroup: 'Legs', equipment: 'Smith Machine' },
  { id: 'tibialis-raise-machine', name: 'Tibialis Raise Machine', muscleGroup: 'Legs', equipment: 'Machine' },

  // Glutes
  { id: 'hip-thrust-machine', name: 'Hip Thrust Machine', muscleGroup: 'Glutes', equipment: 'Machine' },
  { id: 'glute-drive-machine', name: 'Glute Drive Machine', muscleGroup: 'Glutes', equipment: 'Machine' },
  { id: 'smith-machine-hip-thrust', name: 'Smith Machine Hip Thrust', muscleGroup: 'Glutes', equipment: 'Smith Machine' },
  { id: 'cable-glute-kickback', name: 'Cable Glute Kickback', muscleGroup: 'Glutes', equipment: 'Cable' },
  { id: 'cable-pull-through', name: 'Cable Pull-Through', muscleGroup: 'Glutes', equipment: 'Cable' },
  { id: 'glute-kickback-machine', name: 'Glute Kickback Machine', muscleGroup: 'Glutes', equipment: 'Machine' },
  { id: 'multi-hip-extension-machine', name: 'Multi-Hip Extension Machine', muscleGroup: 'Glutes', equipment: 'Machine' },
  { id: 'machine-hip-abduction', name: 'Machine Hip Abduction', muscleGroup: 'Glutes', equipment: 'Machine' },
  { id: 'machine-hip-adduction', name: 'Machine Hip Adduction', muscleGroup: 'Glutes', equipment: 'Machine' },

  // Core
  { id: 'ab-crunch-machine', name: 'Ab Crunch Machine', muscleGroup: 'Core', equipment: 'Machine' },
  { id: 'cable-crunch', name: 'Cable Crunch', muscleGroup: 'Core', equipment: 'Cable' },
  { id: 'kneeling-cable-crunch', name: 'Kneeling Cable Crunch', muscleGroup: 'Core', equipment: 'Cable' },
  { id: 'standing-cable-crunch', name: 'Standing Cable Crunch', muscleGroup: 'Core', equipment: 'Cable' },
  { id: 'rotary-torso', name: 'Rotary Torso Machine', muscleGroup: 'Core', equipment: 'Machine' },
  { id: 'cable-woodchop', name: 'Cable Woodchop', muscleGroup: 'Core', equipment: 'Cable' },
  { id: 'cable-lift', name: 'Cable Lift', muscleGroup: 'Core', equipment: 'Cable' },
  { id: 'pallof-press', name: 'Cable Pallof Press', muscleGroup: 'Core', equipment: 'Cable' },
  { id: 'captains-chair-knee-raise', name: "Captain's Chair Knee Raise", muscleGroup: 'Core', equipment: 'Bodyweight' },
  { id: 'captains-chair-leg-raise', name: "Captain's Chair Leg Raise", muscleGroup: 'Core', equipment: 'Bodyweight' },
  { id: 'roman-chair-back-extension', name: 'Roman Chair Back Extension', muscleGroup: 'Core', equipment: 'Bodyweight' },

  // Free-weight and bodyweight chest movements
  { id: 'barbell-bench-press', name: 'Barbell Bench Press', muscleGroup: 'Chest', equipment: 'Barbell' },
  { id: 'incline-barbell-bench-press', name: 'Incline Barbell Bench Press', muscleGroup: 'Chest', equipment: 'Barbell' },
  { id: 'decline-barbell-bench-press', name: 'Decline Barbell Bench Press', muscleGroup: 'Chest', equipment: 'Barbell' },
  { id: 'barbell-floor-press', name: 'Barbell Floor Press', muscleGroup: 'Chest', equipment: 'Barbell' },
  { id: 'dumbbell-bench-press', name: 'Dumbbell Bench Press', muscleGroup: 'Chest', equipment: 'Dumbbell' },
  { id: 'incline-dumbbell-bench-press', name: 'Incline Dumbbell Bench Press', muscleGroup: 'Chest', equipment: 'Dumbbell' },
  { id: 'decline-dumbbell-bench-press', name: 'Decline Dumbbell Bench Press', muscleGroup: 'Chest', equipment: 'Dumbbell' },
  { id: 'neutral-grip-dumbbell-bench-press', name: 'Neutral-Grip Dumbbell Bench Press', muscleGroup: 'Chest', equipment: 'Dumbbell' },
  { id: 'dumbbell-squeeze-press', name: 'Dumbbell Squeeze Press', muscleGroup: 'Chest', equipment: 'Dumbbell' },
  { id: 'dumbbell-chest-fly', name: 'Dumbbell Chest Fly', muscleGroup: 'Chest', equipment: 'Dumbbell' },
  { id: 'incline-dumbbell-chest-fly', name: 'Incline Dumbbell Chest Fly', muscleGroup: 'Chest', equipment: 'Dumbbell' },
  { id: 'dumbbell-pullover', name: 'Dumbbell Pullover', muscleGroup: 'Chest', equipment: 'Dumbbell' },
  { id: 'push-up', name: 'Push-Up', muscleGroup: 'Chest', equipment: 'Bodyweight' },
  { id: 'incline-push-up', name: 'Incline Push-Up', muscleGroup: 'Chest', equipment: 'Bodyweight' },
  { id: 'decline-push-up', name: 'Decline Push-Up', muscleGroup: 'Chest', equipment: 'Bodyweight' },
  { id: 'weighted-push-up', name: 'Weighted Push-Up', muscleGroup: 'Chest', equipment: 'Bodyweight' },
  { id: 'parallel-bar-dip', name: 'Parallel-Bar Dip', muscleGroup: 'Chest', equipment: 'Bodyweight' },
  { id: 'resistance-band-chest-press', name: 'Resistance-Band Chest Press', muscleGroup: 'Chest', equipment: 'Resistance Band' },

  // Free-weight, bodyweight, landmine, and band back movements
  { id: 'conventional-barbell-deadlift', name: 'Conventional Barbell Deadlift', muscleGroup: 'Back', equipment: 'Barbell' },
  { id: 'barbell-bent-over-row', name: 'Barbell Bent-Over Row', muscleGroup: 'Back', equipment: 'Barbell' },
  { id: 'pendlay-row', name: 'Pendlay Row', muscleGroup: 'Back', equipment: 'Barbell' },
  { id: 'underhand-barbell-row', name: 'Underhand Barbell Row', muscleGroup: 'Back', equipment: 'Barbell' },
  { id: 'barbell-seal-row', name: 'Barbell Seal Row', muscleGroup: 'Back', equipment: 'Barbell' },
  { id: 'one-arm-dumbbell-row', name: 'One-Arm Dumbbell Row', muscleGroup: 'Back', equipment: 'Dumbbell' },
  { id: 'chest-supported-dumbbell-row', name: 'Chest-Supported Dumbbell Row', muscleGroup: 'Back', equipment: 'Dumbbell' },
  { id: 'dumbbell-shrug', name: 'Dumbbell Shrug', muscleGroup: 'Back', equipment: 'Dumbbell' },
  { id: 'pull-up', name: 'Pull-Up', muscleGroup: 'Back', equipment: 'Bodyweight' },
  { id: 'chin-up', name: 'Chin-Up', muscleGroup: 'Back', equipment: 'Bodyweight' },
  { id: 'neutral-grip-pull-up', name: 'Neutral-Grip Pull-Up', muscleGroup: 'Back', equipment: 'Bodyweight' },
  { id: 'weighted-pull-up', name: 'Weighted Pull-Up', muscleGroup: 'Back', equipment: 'Bodyweight' },
  { id: 't-bar-row', name: 'T-Bar Row', muscleGroup: 'Back', equipment: 'Machine' },
  { id: 'landmine-row', name: 'Landmine Row', muscleGroup: 'Back', equipment: 'Landmine' },
  { id: 'meadows-row', name: 'Meadows Row', muscleGroup: 'Back', equipment: 'Landmine' },
  { id: 'inverted-row', name: 'Inverted Row', muscleGroup: 'Back', equipment: 'Bodyweight' },
  { id: 'suspension-trainer-row', name: 'Suspension-Trainer Row', muscleGroup: 'Back', equipment: 'Other' },
  { id: 'resistance-band-seated-row', name: 'Resistance-Band Seated Row', muscleGroup: 'Back', equipment: 'Resistance Band' },
  { id: 'resistance-band-lat-pulldown', name: 'Resistance-Band Lat Pulldown', muscleGroup: 'Back', equipment: 'Resistance Band' },
  { id: 'resistance-band-pull-apart', name: 'Resistance-Band Pull-Apart', muscleGroup: 'Back', equipment: 'Resistance Band' },

  // Free-weight, bodyweight, landmine, and band shoulder movements
  { id: 'standing-barbell-overhead-press', name: 'Standing Barbell Overhead Press', muscleGroup: 'Shoulders', equipment: 'Barbell' },
  { id: 'seated-barbell-overhead-press', name: 'Seated Barbell Overhead Press', muscleGroup: 'Shoulders', equipment: 'Barbell' },
  { id: 'barbell-push-press', name: 'Barbell Push Press', muscleGroup: 'Shoulders', equipment: 'Barbell' },
  { id: 'dumbbell-shoulder-press', name: 'Dumbbell Shoulder Press', muscleGroup: 'Shoulders', equipment: 'Dumbbell' },
  { id: 'neutral-grip-dumbbell-shoulder-press', name: 'Neutral-Grip Dumbbell Shoulder Press', muscleGroup: 'Shoulders', equipment: 'Dumbbell' },
  { id: 'arnold-press', name: 'Arnold Press', muscleGroup: 'Shoulders', equipment: 'Dumbbell' },
  { id: 'dumbbell-lateral-raise', name: 'Dumbbell Lateral Raise', muscleGroup: 'Shoulders', equipment: 'Dumbbell' },
  { id: 'lean-away-dumbbell-lateral-raise', name: 'Lean-Away Dumbbell Lateral Raise', muscleGroup: 'Shoulders', equipment: 'Dumbbell' },
  { id: 'dumbbell-front-raise', name: 'Dumbbell Front Raise', muscleGroup: 'Shoulders', equipment: 'Dumbbell' },
  { id: 'bent-over-dumbbell-rear-delt-fly', name: 'Bent-Over Dumbbell Rear-Delt Fly', muscleGroup: 'Shoulders', equipment: 'Dumbbell' },
  { id: 'prone-dumbbell-y-raise', name: 'Prone Dumbbell Y-Raise', muscleGroup: 'Shoulders', equipment: 'Dumbbell' },
  { id: 'landmine-shoulder-press', name: 'Landmine Shoulder Press', muscleGroup: 'Shoulders', equipment: 'Landmine' },
  { id: 'single-arm-landmine-press', name: 'Single-Arm Landmine Press', muscleGroup: 'Shoulders', equipment: 'Landmine' },
  { id: 'resistance-band-lateral-raise', name: 'Resistance-Band Lateral Raise', muscleGroup: 'Shoulders', equipment: 'Resistance Band' },
  { id: 'pike-push-up', name: 'Pike Push-Up', muscleGroup: 'Shoulders', equipment: 'Bodyweight' },

  // Dumbbell, barbell, EZ-bar, and bodyweight arm movements
  { id: 'barbell-bicep-curl', name: 'Barbell Bicep Curl', muscleGroup: 'Arms', equipment: 'Barbell' },
  { id: 'ez-bar-curl', name: 'EZ-Bar Curl', muscleGroup: 'Arms', equipment: 'EZ Bar' },
  { id: 'dumbbell-bicep-curl', name: 'Dumbbell Bicep Curl', muscleGroup: 'Arms', equipment: 'Dumbbell' },
  { id: 'alternating-dumbbell-curl', name: 'Alternating Dumbbell Curl', muscleGroup: 'Arms', equipment: 'Dumbbell' },
  { id: 'incline-dumbbell-curl', name: 'Incline Dumbbell Curl', muscleGroup: 'Arms', equipment: 'Dumbbell' },
  { id: 'concentration-curl', name: 'Concentration Curl', muscleGroup: 'Arms', equipment: 'Dumbbell' },
  { id: 'dumbbell-hammer-curl', name: 'Dumbbell Hammer Curl', muscleGroup: 'Arms', equipment: 'Dumbbell' },
  { id: 'cross-body-hammer-curl', name: 'Cross-Body Hammer Curl', muscleGroup: 'Arms', equipment: 'Dumbbell' },
  { id: 'ez-bar-reverse-curl', name: 'EZ-Bar Reverse Curl', muscleGroup: 'Arms', equipment: 'EZ Bar' },
  { id: 'dumbbell-spider-curl', name: 'Dumbbell Spider Curl', muscleGroup: 'Arms', equipment: 'Dumbbell' },
  { id: 'zottman-curl', name: 'Zottman Curl', muscleGroup: 'Arms', equipment: 'Dumbbell' },
  { id: 'close-grip-barbell-bench-press', name: 'Close-Grip Barbell Bench Press', muscleGroup: 'Arms', equipment: 'Barbell' },
  { id: 'barbell-skull-crusher', name: 'Barbell Skull Crusher', muscleGroup: 'Arms', equipment: 'Barbell' },
  { id: 'ez-bar-skull-crusher', name: 'EZ-Bar Skull Crusher', muscleGroup: 'Arms', equipment: 'EZ Bar' },
  { id: 'dumbbell-skull-crusher', name: 'Dumbbell Skull Crusher', muscleGroup: 'Arms', equipment: 'Dumbbell' },
  { id: 'two-hand-dumbbell-overhead-tricep-extension', name: 'Two-Hand Dumbbell Overhead Tricep Extension', muscleGroup: 'Arms', equipment: 'Dumbbell' },
  { id: 'single-arm-dumbbell-overhead-tricep-extension', name: 'Single-Arm Dumbbell Overhead Tricep Extension', muscleGroup: 'Arms', equipment: 'Dumbbell' },
  { id: 'dumbbell-tricep-kickback', name: 'Dumbbell Tricep Kickback', muscleGroup: 'Arms', equipment: 'Dumbbell' },
  { id: 'bench-dip', name: 'Bench Dip', muscleGroup: 'Arms', equipment: 'Bodyweight' },
  { id: 'diamond-push-up', name: 'Diamond Push-Up', muscleGroup: 'Arms', equipment: 'Bodyweight' },
  { id: 'barbell-jm-press', name: 'Barbell JM Press', muscleGroup: 'Arms', equipment: 'Barbell' },
  { id: 'barbell-wrist-curl', name: 'Barbell Wrist Curl', muscleGroup: 'Arms', equipment: 'Barbell' },

  // Barbell, dumbbell, bodyweight, and specialty lower-body movements
  { id: 'barbell-back-squat', name: 'Barbell Back Squat', muscleGroup: 'Legs', equipment: 'Barbell' },
  { id: 'barbell-front-squat', name: 'Barbell Front Squat', muscleGroup: 'Legs', equipment: 'Barbell' },
  { id: 'barbell-box-squat', name: 'Barbell Box Squat', muscleGroup: 'Legs', equipment: 'Barbell' },
  { id: 'zercher-squat', name: 'Zercher Squat', muscleGroup: 'Legs', equipment: 'Barbell' },
  { id: 'dumbbell-goblet-squat', name: 'Dumbbell Goblet Squat', muscleGroup: 'Legs', equipment: 'Dumbbell' },
  { id: 'dumbbell-squat', name: 'Dumbbell Squat', muscleGroup: 'Legs', equipment: 'Dumbbell' },
  { id: 'dumbbell-bulgarian-split-squat', name: 'Dumbbell Bulgarian Split Squat', muscleGroup: 'Legs', equipment: 'Dumbbell' },
  { id: 'barbell-split-squat', name: 'Barbell Split Squat', muscleGroup: 'Legs', equipment: 'Barbell' },
  { id: 'dumbbell-reverse-lunge', name: 'Dumbbell Reverse Lunge', muscleGroup: 'Legs', equipment: 'Dumbbell' },
  { id: 'dumbbell-walking-lunge', name: 'Dumbbell Walking Lunge', muscleGroup: 'Legs', equipment: 'Dumbbell' },
  { id: 'dumbbell-step-up', name: 'Dumbbell Step-Up', muscleGroup: 'Legs', equipment: 'Dumbbell' },
  { id: 'barbell-romanian-deadlift', name: 'Barbell Romanian Deadlift', muscleGroup: 'Legs', equipment: 'Barbell' },
  { id: 'dumbbell-romanian-deadlift', name: 'Dumbbell Romanian Deadlift', muscleGroup: 'Legs', equipment: 'Dumbbell' },
  { id: 'barbell-stiff-leg-deadlift', name: 'Barbell Stiff-Leg Deadlift', muscleGroup: 'Legs', equipment: 'Barbell' },
  { id: 'sumo-barbell-deadlift', name: 'Sumo Barbell Deadlift', muscleGroup: 'Legs', equipment: 'Barbell' },
  { id: 'trap-bar-romanian-deadlift', name: 'Trap-Bar Romanian Deadlift', muscleGroup: 'Legs', equipment: 'Trap Bar' },
  { id: 'trap-bar-squat', name: 'Trap-Bar Squat', muscleGroup: 'Legs', equipment: 'Trap Bar' },
  { id: 'barbell-good-morning', name: 'Barbell Good Morning', muscleGroup: 'Legs', equipment: 'Barbell' },
  { id: 'nordic-hamstring-curl', name: 'Nordic Hamstring Curl', muscleGroup: 'Legs', equipment: 'Bodyweight' },
  { id: 'glute-ham-raise', name: 'Glute-Ham Raise', muscleGroup: 'Legs', equipment: 'Bodyweight' },
  { id: 'bodyweight-squat', name: 'Bodyweight Squat', muscleGroup: 'Legs', equipment: 'Bodyweight' },
  { id: 'pistol-squat', name: 'Pistol Squat', muscleGroup: 'Legs', equipment: 'Bodyweight' },
  { id: 'sissy-squat', name: 'Sissy Squat', muscleGroup: 'Legs', equipment: 'Bodyweight' },
  { id: 'standing-bodyweight-calf-raise', name: 'Standing Bodyweight Calf Raise', muscleGroup: 'Legs', equipment: 'Bodyweight' },
  { id: 'dumbbell-standing-calf-raise', name: 'Dumbbell Standing Calf Raise', muscleGroup: 'Legs', equipment: 'Dumbbell' },
  { id: 'donkey-calf-raise', name: 'Donkey Calf Raise', muscleGroup: 'Legs', equipment: 'Bodyweight' },
  { id: 'bodyweight-tibialis-raise', name: 'Bodyweight Tibialis Raise', muscleGroup: 'Legs', equipment: 'Bodyweight' },

  // Free-weight, band, and bodyweight glute movements
  { id: 'barbell-hip-thrust', name: 'Barbell Hip Thrust', muscleGroup: 'Glutes', equipment: 'Barbell' },
  { id: 'dumbbell-hip-thrust', name: 'Dumbbell Hip Thrust', muscleGroup: 'Glutes', equipment: 'Dumbbell' },
  { id: 'barbell-glute-bridge', name: 'Barbell Glute Bridge', muscleGroup: 'Glutes', equipment: 'Barbell' },
  { id: 'dumbbell-glute-bridge', name: 'Dumbbell Glute Bridge', muscleGroup: 'Glutes', equipment: 'Dumbbell' },
  { id: 'frog-pump', name: 'Frog Pump', muscleGroup: 'Glutes', equipment: 'Bodyweight' },
  { id: 'resistance-band-hip-abduction', name: 'Resistance-Band Hip Abduction', muscleGroup: 'Glutes', equipment: 'Resistance Band' },
  { id: 'resistance-band-glute-kickback', name: 'Resistance-Band Glute Kickback', muscleGroup: 'Glutes', equipment: 'Resistance Band' },
  { id: 'reverse-hyperextension', name: 'Reverse Hyperextension', muscleGroup: 'Glutes', equipment: 'Machine' },

  // Bodyweight, free-weight, and stability core movements
  { id: 'forearm-plank', name: 'Forearm Plank', muscleGroup: 'Core', equipment: 'Bodyweight' },
  { id: 'side-plank', name: 'Side Plank', muscleGroup: 'Core', equipment: 'Bodyweight' },
  { id: 'weighted-plank', name: 'Weighted Plank', muscleGroup: 'Core', equipment: 'Bodyweight' },
  { id: 'dead-bug', name: 'Dead Bug', muscleGroup: 'Core', equipment: 'Bodyweight' },
  { id: 'bird-dog', name: 'Bird Dog', muscleGroup: 'Core', equipment: 'Bodyweight' },
  { id: 'ab-wheel-rollout', name: 'Ab-Wheel Rollout', muscleGroup: 'Core', equipment: 'Other' },
  { id: 'hanging-knee-raise', name: 'Hanging Knee Raise', muscleGroup: 'Core', equipment: 'Bodyweight' },
  { id: 'hanging-leg-raise', name: 'Hanging Leg Raise', muscleGroup: 'Core', equipment: 'Bodyweight' },
  { id: 'toes-to-bar', name: 'Toes-to-Bar', muscleGroup: 'Core', equipment: 'Bodyweight' },
  { id: 'decline-sit-up', name: 'Decline Sit-Up', muscleGroup: 'Core', equipment: 'Bodyweight' },
  { id: 'weighted-crunch', name: 'Weighted Crunch', muscleGroup: 'Core', equipment: 'Other' },
  { id: 'bicycle-crunch', name: 'Bicycle Crunch', muscleGroup: 'Core', equipment: 'Bodyweight' },
  { id: 'dumbbell-russian-twist', name: 'Dumbbell Russian Twist', muscleGroup: 'Core', equipment: 'Dumbbell' },
  { id: 'stability-ball-crunch', name: 'Stability-Ball Crunch', muscleGroup: 'Core', equipment: 'Other' },
  { id: 'hollow-body-hold', name: 'Hollow-Body Hold', muscleGroup: 'Core', equipment: 'Bodyweight' },
  { id: 'medicine-ball-rotational-throw', name: 'Medicine-Ball Rotational Throw', muscleGroup: 'Core', equipment: 'Medicine Ball' },

  // Full-body power, kettlebell, carry, sled, and conditioning movements
  { id: 'trap-bar-deadlift', name: 'Trap-Bar Deadlift', muscleGroup: 'Full Body', equipment: 'Trap Bar' },
  { id: 'kettlebell-swing', name: 'Kettlebell Swing', muscleGroup: 'Full Body', equipment: 'Kettlebell' },
  { id: 'kettlebell-clean', name: 'Kettlebell Clean', muscleGroup: 'Full Body', equipment: 'Kettlebell' },
  { id: 'kettlebell-snatch', name: 'Kettlebell Snatch', muscleGroup: 'Full Body', equipment: 'Kettlebell' },
  { id: 'kettlebell-turkish-get-up', name: 'Kettlebell Turkish Get-Up', muscleGroup: 'Full Body', equipment: 'Kettlebell' },
  { id: 'kettlebell-goblet-squat', name: 'Kettlebell Goblet Squat', muscleGroup: 'Full Body', equipment: 'Kettlebell' },
  { id: 'barbell-clean', name: 'Barbell Clean', muscleGroup: 'Full Body', equipment: 'Barbell' },
  { id: 'barbell-power-clean', name: 'Barbell Power Clean', muscleGroup: 'Full Body', equipment: 'Barbell' },
  { id: 'barbell-snatch', name: 'Barbell Snatch', muscleGroup: 'Full Body', equipment: 'Barbell' },
  { id: 'barbell-thruster', name: 'Barbell Thruster', muscleGroup: 'Full Body', equipment: 'Barbell' },
  { id: 'dumbbell-thruster', name: 'Dumbbell Thruster', muscleGroup: 'Full Body', equipment: 'Dumbbell' },
  { id: 'landmine-squat-to-press', name: 'Landmine Squat-to-Press', muscleGroup: 'Full Body', equipment: 'Landmine' },
  { id: 'sled-push', name: 'Sled Push', muscleGroup: 'Full Body', equipment: 'Sled' },
  { id: 'sled-pull', name: 'Sled Pull', muscleGroup: 'Full Body', equipment: 'Sled' },
  { id: 'backward-sled-drag', name: 'Backward Sled Drag', muscleGroup: 'Full Body', equipment: 'Sled' },
  { id: 'farmer-carry', name: 'Farmer Carry', muscleGroup: 'Full Body', equipment: 'Dumbbell' },
  { id: 'suitcase-carry', name: 'Suitcase Carry', muscleGroup: 'Full Body', equipment: 'Dumbbell' },
  { id: 'battle-rope-waves', name: 'Battle-Rope Waves', muscleGroup: 'Full Body', equipment: 'Other' },
  { id: 'medicine-ball-slam', name: 'Medicine-Ball Slam', muscleGroup: 'Full Body', equipment: 'Medicine Ball' },
  { id: 'wall-ball-shot', name: 'Wall-Ball Shot', muscleGroup: 'Full Body', equipment: 'Medicine Ball' },
  { id: 'medicine-ball-chest-pass', name: 'Medicine-Ball Chest Pass', muscleGroup: 'Full Body', equipment: 'Medicine Ball' },
  { id: 'sandbag-bear-hug-carry', name: 'Sandbag Bear-Hug Carry', muscleGroup: 'Full Body', equipment: 'Other' },
];

export const MUSCLE_GROUPS = [...new Set(EXERCISES.map((e) => e.muscleGroup))];

export const EXERCISE_EQUIPMENT: ExerciseEquipment[] = [
  'Machine',
  'Cable',
  'Dumbbell',
  'Barbell',
  'EZ Bar',
  'Smith Machine',
  'Bodyweight',
  'Assisted',
  'Kettlebell',
  'Landmine',
  'Resistance Band',
  'Trap Bar',
  'Sled',
  'Medicine Ball',
  'Other',
];

/** Selector groups: all strength exercises, each muscle group, then cardio. */
export const ALL_STRENGTH_GROUP = 'All';
export const CARDIO_GROUP = 'Cardio';
export const SELECTOR_GROUPS = [ALL_STRENGTH_GROUP, ...MUSCLE_GROUPS, CARDIO_GROUP];

interface SelectorFilters {
  query?: string;
  equipment?: ExerciseEquipment | '';
}

export function getSelectorItems(group: string, filters: SelectorFilters = {}) {
  const query = filters.query?.trim().toLowerCase() ?? '';
  if (group === CARDIO_GROUP) {
    if (!query) return CARDIO_EQUIPMENT;
    return CARDIO_EQUIPMENT.filter((item) =>
      `${item.name} ${item.category} ${item.description}`.toLowerCase().includes(query),
    );
  }

  let items =
    group === ALL_STRENGTH_GROUP
      ? EXERCISES
      : EXERCISES.filter((exercise) => exercise.muscleGroup === group);
  if (filters.equipment) {
    items = items.filter((exercise) => exercise.equipment === filters.equipment);
  }
  if (query) {
    items = items.filter((exercise) =>
      `${exercise.name} ${exercise.muscleGroup} ${exercise.equipment ?? ''}`
        .toLowerCase()
        .includes(query),
    );
  }
  return items;
}

export function isCardioGroup(group: string) {
  return group === CARDIO_GROUP;
}
