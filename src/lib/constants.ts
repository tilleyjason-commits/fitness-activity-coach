import { Apple, Dumbbell, Milk, Moon, Sun, Sunrise, Zap, type LucideIcon } from 'lucide-react';
import rulesJson from '../../rules/rules.json';
import type { MealSlot, Profile } from './types';

/** Athlete defaults shipped with the rules file (used when profile fields are empty). */
export const ATHLETE_PROFILE = rulesJson.athlete_profile;

export interface MacroTargets {
  calories: number;
  caloriesMin: number;
  caloriesMax: number;
  proteinG: number;
  proteinMinG: number;
  proteinMaxG: number;
  carbsG: number;
  fatG: number;
}

export interface MealTiming {
  preGymSnack: string;
  training: string;
  postGymMeal: string;
  snack3pm: string;
  casein: string;
  caffeineCutoff: string;
  bedtime: string;
  waketime: string;
}

export const DEFAULT_TARGETS: MacroTargets = {
  calories: ATHLETE_PROFILE.target_calories,
  caloriesMin: 2350,
  caloriesMax: 2650,
  proteinG: ATHLETE_PROFILE.target_protein_g,
  proteinMinG: 195,
  proteinMaxG: 205,
  carbsG: ATHLETE_PROFILE.target_carbs_g,
  fatG: ATHLETE_PROFILE.target_fat_g,
};

/** @deprecated Prefer resolveTargets(profile) for multi-user UI. */
export const TARGETS = DEFAULT_TARGETS;

export const DEFAULT_MEAL_TIMING: MealTiming = {
  preGymSnack: '10:15',
  training: '11:00',
  postGymMeal: '12:15',
  snack3pm: '15:00',
  casein: '20:00',
  caffeineCutoff: '14:00',
  bedtime: '22:00',
  waketime: '06:00',
};

/** @deprecated Prefer resolveMealTiming(profile). */
export const MEAL_TIMING = DEFAULT_MEAL_TIMING;

function toHHMM(time: string | null | undefined, fallback: string): string {
  if (!time) return fallback;
  return time.length > 5 ? time.slice(0, 5) : time;
}

function addMinutes(hhmm: string, delta: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (((h * 60 + m + delta) % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Profile-driven macro targets. Protein ~1.0 g per lb bodyweight (clamped),
 * calorie band ±150 around a goal-aware baseline, fat ~0.3 g/lb.
 */
export function resolveTargets(profile: Profile | null | undefined): MacroTargets {
  if (!profile) return { ...DEFAULT_TARGETS };

  const weight = profile.weight_lb && profile.weight_lb > 0 ? profile.weight_lb : null;
  const goalWeight =
    profile.goal_weight_lb && profile.goal_weight_lb > 0 ? profile.goal_weight_lb : weight;

  const proteinG = weight
    ? Math.round(Math.min(220, Math.max(140, weight * 1.0)))
    : DEFAULT_TARGETS.proteinG;
  const proteinMinG = proteinG - 5;
  const proteinMaxG = proteinG + 5;

  let calories = DEFAULT_TARGETS.calories;
  if (weight && goalWeight) {
    // Recomposition deficit: ~200-300 cal/day max (Helms MASS V10I7).
    // Maintenance estimate ~12 cal/lb, deficit capped at 250, scaled at
    // 8 cal/lb of gap so large gaps don't push below the 2000 floor.
    const deltaLb = weight - goalWeight;
    calories = Math.round(
      Math.min(3200, Math.max(2000, 12 * weight - Math.sign(deltaLb) * Math.min(250, Math.abs(deltaLb) * 8))),
    );
  } else if (weight) {
    // No goal weight: maintenance-ish, not a deficit.
    calories = Math.round(Math.min(3200, Math.max(2000, weight * 13)));
  }

  const fatG = weight
    ? Math.round(Math.min(90, Math.max(45, weight * 0.3)))
    : DEFAULT_TARGETS.fatG;
  const carbsG = Math.max(
    120,
    Math.round((calories - proteinG * 4 - fatG * 9) / 4),
  );

  return {
    calories,
    caloriesMin: calories - 150,
    caloriesMax: calories + 150,
    proteinG,
    proteinMinG,
    proteinMaxG,
    carbsG,
    fatG,
  };
}

/** Anchor meal timing around the athlete's preferred training_time. */
export function resolveMealTiming(profile: Profile | null | undefined): MealTiming {
  const training = toHHMM(profile?.training_time, DEFAULT_MEAL_TIMING.training);
  return {
    ...DEFAULT_MEAL_TIMING,
    training,
    preGymSnack: addMinutes(training, -45),
    postGymMeal: addMinutes(training, 75),
    // Caffeine cutoff ~3h before typical bedtime remains default unless later customized.
  };
}

/** Canonical render order for the macro tracker's meal cards. */
export const MEAL_SLOTS: MealSlot[] = [
  'breakfast',
  'pre_workout_snack',
  'lunch',
  'post_gym',
  'snack',
  'dinner',
  'bedtime_snack',
];

export const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  pre_workout_snack: 'Pre-Workout Snack',
  lunch: 'Lunch',
  post_gym: 'Post-Gym Meal',
  snack: 'Snack',
  dinner: 'Dinner',
  bedtime_snack: 'Bedtime Snack',
};

/** Typed lucide mapping — matches the app's icon language, renders identically on every platform. */
export const MEAL_SLOT_ICONS: Record<MealSlot, LucideIcon> = {
  breakfast: Sunrise,
  pre_workout_snack: Zap,
  lunch: Sun,
  post_gym: Dumbbell,
  snack: Apple,
  dinner: Moon,
  bedtime_snack: Milk,
};

export function getMealSlotTimes(
  timing: MealTiming = DEFAULT_MEAL_TIMING,
): Record<MealSlot, { start: string; hint: string }> {
  return {
    breakfast: { start: '07:00', hint: 'Morning meal' },
    pre_workout_snack: {
      start: timing.preGymSnack,
      hint: `Fuel ~45 min before ${timing.training} training`,
    },
    lunch: { start: '12:00', hint: 'Mid-day meal' },
    post_gym: {
      start: timing.postGymMeal,
      hint: `After training (~${timing.postGymMeal})`,
    },
    snack: { start: timing.snack3pm, hint: '3pm snack' },
    dinner: { start: '18:00', hint: 'Evening meal' },
    bedtime_snack: {
      start: timing.casein,
      hint: `Pre-sleep protein / casein (~${timing.casein})`,
    },
  };
}

/** Default slot times (Jason baseline / no profile loaded). */
export const MEAL_SLOT_TIMES = getMealSlotTimes(DEFAULT_MEAL_TIMING);

export type SessionType = 'Upper A' | 'Lower A' | 'Back + Biceps' | 'Upper B' | 'Lower B';

export const SESSION_TYPES: SessionType[] = [
  'Upper A',
  'Lower A',
  'Back + Biceps',
  'Upper B',
  'Lower B',
];

/** Default session for each training weekday (M-F schedule). */
export const WEEKDAY_SESSIONS: Record<string, SessionType> = {
  Monday: 'Upper A',
  Tuesday: 'Lower A',
  Wednesday: 'Back + Biceps',
  Thursday: 'Upper B',
  Friday: 'Lower B',
};

export interface ExerciseTemplate {
  name: string;
  sets: number;
  reps: string;
  isCompound: boolean;
  muscle: string;
}

/**
 * Program reference ("gym cards"). Knee-safe (no barbell squat) and
 * shoulder-safe (no barbell OHP) per the coaching rules.
 */
export const SESSION_TEMPLATES: Record<SessionType, ExerciseTemplate[]> = {
  'Upper A': [
    { name: 'DB Bench Press', sets: 3, reps: '8-12', isCompound: true, muscle: 'chest' },
    { name: 'Seated Cable Row', sets: 3, reps: '8-12', isCompound: true, muscle: 'back' },
    { name: 'DB Neutral-Grip Shoulder Press', sets: 3, reps: '8-12', isCompound: true, muscle: 'shoulders' },
    { name: 'Lat Pulldown', sets: 3, reps: '8-12', isCompound: true, muscle: 'back' },
    { name: 'Face Pulls', sets: 3, reps: '12-15', isCompound: false, muscle: 'rear delts' },
    { name: 'Triceps Pushdown', sets: 3, reps: '10-15', isCompound: false, muscle: 'triceps' },
  ],
  'Lower A': [
    { name: 'Leg Press', sets: 3, reps: '8-12', isCompound: true, muscle: 'quads' },
    { name: 'Bulgarian Split Squat', sets: 3, reps: '8-10', isCompound: true, muscle: 'quads' },
    { name: 'Seated Leg Curl', sets: 3, reps: '10-15', isCompound: false, muscle: 'hamstrings' },
    { name: 'Leg Extension', sets: 3, reps: '12-15', isCompound: false, muscle: 'quads' },
    { name: 'Standing Calf Raise', sets: 3, reps: '12-15', isCompound: false, muscle: 'calves' },
  ],
  'Back + Biceps': [
    { name: 'Chest-Supported Row', sets: 3, reps: '8-12', isCompound: true, muscle: 'back' },
    { name: 'Lat Pulldown', sets: 3, reps: '8-12', isCompound: true, muscle: 'back' },
    { name: 'Single-Arm Cable Row', sets: 3, reps: '10-12', isCompound: true, muscle: 'back' },
    { name: 'EZ-Bar Curl', sets: 3, reps: '8-12', isCompound: false, muscle: 'biceps' },
    { name: 'Incline DB Curl', sets: 3, reps: '10-15', isCompound: false, muscle: 'biceps' },
    { name: 'Hammer Curl', sets: 2, reps: '10-15', isCompound: false, muscle: 'biceps' },
  ],
  'Upper B': [
    { name: 'Incline DB Press', sets: 3, reps: '8-12', isCompound: true, muscle: 'chest' },
    { name: 'Machine Chest Press', sets: 3, reps: '8-12', isCompound: true, muscle: 'chest' },
    { name: 'One-Arm DB Row', sets: 3, reps: '8-12', isCompound: true, muscle: 'back' },
    { name: 'DB Lateral Raise', sets: 3, reps: '12-15', isCompound: false, muscle: 'shoulders' },
    { name: 'Face Pulls', sets: 3, reps: '12-15', isCompound: false, muscle: 'rear delts' },
    { name: 'Overhead Cable Triceps Extension', sets: 3, reps: '10-15', isCompound: false, muscle: 'triceps' },
  ],
  'Lower B': [
    { name: 'Hack Squat', sets: 3, reps: '8-12', isCompound: true, muscle: 'quads' },
    { name: 'Romanian Deadlift', sets: 3, reps: '8-10', isCompound: true, muscle: 'hamstrings' },
    { name: 'Lying Leg Curl', sets: 3, reps: '10-15', isCompound: false, muscle: 'hamstrings' },
    { name: 'Leg Extension', sets: 3, reps: '12-15', isCompound: false, muscle: 'quads' },
    { name: 'Seated Calf Raise', sets: 3, reps: '12-15', isCompound: false, muscle: 'calves' },
  ],
};

/** Fold every template into a name → muscle lookup for weekly volume math. */
const MUSCLE_BY_EXERCISE = new Map<string, string>();
for (const exercises of Object.values(SESSION_TEMPLATES)) {
  for (const ex of exercises) {
    MUSCLE_BY_EXERCISE.set(ex.name.toLowerCase(), ex.muscle);
  }
}

export function muscleForExercise(name: string): string | null {
  const key = name.trim().toLowerCase();
  const direct = MUSCLE_BY_EXERCISE.get(key);
  if (direct) return direct;
  for (const [templateName, muscle] of MUSCLE_BY_EXERCISE) {
    if (key.includes(templateName) || templateName.includes(key)) return muscle;
  }
  return null;
}

/** Validated chart palette (dataviz six-checks, dark surface #1e293b). */
export const CHART = {
  primary: '#059669', // emerald-600 — slot 1 series
  secondary: '#3b82f6', // blue-500 — slot 2 series
  gridDark: '#334155', // slate-700 hairline
  gridLight: '#e2e8f0', // slate-200 hairline
  textMuted: '#94a3b8', // slate-400 axis ink
} as const;

export const ENERGY_EMOJIS = ['🥱', '😪', '😐', '🙂', '⚡'];
export const STRESS_EMOJIS = ['😌', '🙂', '😐', '😟', '🤯'];
export const HUNGER_EMOJIS = ['😌', '🙂', '😐', '😋', '🍽️'];

export const THEME_STORAGE_KEY = 'fac-theme';
export const NOTIFICATIONS_STORAGE_KEY = 'fac-notifications';
