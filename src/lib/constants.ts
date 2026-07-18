import rulesJson from '../../rules/rules.json';

/** Athlete profile + macro targets shipped with the rules file. */
export const ATHLETE_PROFILE = rulesJson.athlete_profile;

export const TARGETS = {
  calories: ATHLETE_PROFILE.target_calories,
  caloriesMin: 2350,
  caloriesMax: 2650,
  proteinG: ATHLETE_PROFILE.target_protein_g,
  proteinMinG: 195,
  proteinMaxG: 205,
  carbsG: ATHLETE_PROFILE.target_carbs_g,
  fatG: ATHLETE_PROFILE.target_fat_g,
} as const;

export const MEAL_TIMING = {
  preGymSnack: '10:15',
  training: '11:00',
  postGymMeal: '12:15',
  snack3pm: '15:00',
  casein: '20:00',
  caffeineCutoff: '14:00',
  bedtime: '22:00',
  waketime: '06:00',
} as const;

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
