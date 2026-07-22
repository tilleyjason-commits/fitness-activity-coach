/** TypeScript types mirroring the Supabase schema (see supabase/migrations). */

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export interface Profile {
  /** Ownership contract: id and user_id are both auth.uid() and must match. */
  id: string;
  user_id: string;
  age: number | null;
  height_cm: number | null;
  weight_lb: number | null;
  bodyfat_pct: number | null;
  goal_bodyfat_pct: number | null;
  goal_weight_lb: number | null;
  training_years: number | null;
  training_time: string | null;
}

/** The fields the onboarding wizard (/setup) collects; a subset of Profile. */
export interface ProfileSetup {
  age: number | null;
  height_cm: number | null;
  weight_lb: number | null;
  bodyfat_pct: number | null;
  goal_bodyfat_pct: number | null;
  goal_weight_lb: number | null;
  training_years: number | null;
  training_time: string | null;
}

export interface DailyLog {
  id: string;
  user_id: string;
  log_date: string;
  day_of_week: string | null;
  training_done: boolean;
  training_session_type: string | null;
  compound_rir: number | null;
  isolation_rir: number | null;
  double_progression_followed: boolean | null;
  barbell_squat_done: boolean;
  barbell_ohp_done: boolean;
  daily_calories: number | null;
  daily_protein_g: number | null;
  daily_carbs_g: number | null;
  daily_fat_g: number | null;
  pre_gym_snack_time: string | null;
  post_gym_meal_time: string | null;
  snack_3pm_logged: boolean;
  casein_taken: boolean;
  dinner_logged: boolean;
  dinner_plates: number;
  dinner_protein_first: boolean;
  candy_cravings_today: number;
  creatine_taken: boolean;
  beta_alanine_taken: boolean;
  omega3_taken: boolean;
  caffeine_mg: number | null;
  vitamin_d_taken: boolean;
  magnesium_taken: boolean;
  last_caffeine_time: string | null;
  caffeine_cutoff_respected: boolean | null;
  bedtime: string | null;
  waketime: string | null;
  last_screen_time: string | null;
  early_wake: boolean;
  sleep_quality: number | null;
  energy_score: number | null;
  stress_score: number | null;
  hunger_score: number | null;
  meals_count: number | null;
  compound_rest_sec: number | null;
  isolation_rest_sec: number | null;
  session_minutes: number | null;
  full_rom_followed: boolean;
  last_deload_date: string | null;
  weekly_weight_lb: number | null;
  weekly_waist_inches: number | null;
  notes: string | null;
  created_at: string;
}

/** Insert/upsert shape: id and created_at are DB-generated. */
export type DailyLogInsert = Partial<Omit<DailyLog, 'id' | 'created_at'>> & {
  user_id: string;
  log_date: string;
};

export interface ExerciseLog {
  id: string;
  daily_log_id: string;
  exercise_name: string;
  sets_completed: number | null;
  target_sets: number | null;
  reps_completed: number | null;
  target_reps: string | null;
  weight_lb: number | null;
  rir: number | null;
  notes: string | null;
}

export type ExerciseLogInsert = Omit<ExerciseLog, 'id'>;

export interface WeeklySummary {
  id: string;
  user_id: string;
  week_start: string;
  training_compliance_pct: number | null;
  protein_avg_g: number | null;
  calories_avg: number | null;
  casein_compliance_pct: number | null;
  snack_3pm_compliance_pct: number | null;
  caffeine_cutoff_pct: number | null;
  sleep_quality_avg: number | null;
  candy_cravings_total: number | null;
  weight_change_lb: number | null;
  waist_change_inches: number | null;
  compliance_pct: number | null;
  weakest_area: string | null;
  created_at: string;
}

export type WeeklySummaryInsert = Partial<Omit<WeeklySummary, 'id' | 'created_at'>> & {
  user_id: string;
  week_start: string;
};

export type MealSlot =
  | 'breakfast'
  | 'lunch'
  | 'dinner'
  | 'post_gym'
  | 'snack'
  | 'pre_workout_snack'
  | 'bedtime_snack';

export interface MealLog {
  id: string;
  daily_log_id: string;
  meal_slot: MealSlot;
  meal_time: string | null;
  raw_input: string | null;
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  created_at: string;
}

/** Upsert shape: id and created_at are DB-generated. */
export type MealLogInsert = Partial<Omit<MealLog, 'id' | 'created_at'>> & {
  daily_log_id: string;
  meal_slot: MealSlot;
};

export interface MealFood {
  id: string;
  meal_log_id: string;
  food_name: string;
  quantity: number | null;
  unit: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: 'high' | 'medium' | 'low' | null;
  created_at: string;
}

export type MealFoodInsert = Omit<MealFood, 'id' | 'created_at'>;

/** One food row as returned by the calculate-macros Edge Function. */
export interface AIFood {
  food_name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface MacrosFromAI {
  foods: AIFood[];
  meal_total: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
  /** Which stack produced the answer (nvidia primary, deepseek fallback). */
  provider?: 'nvidia' | 'deepseek';
  /** Exact model id used for the successful calculation. */
  model?: string;
  /** True when DeepSeek served after NVIDIA failed — always surface in UI. */
  fallback?: boolean;
  /** Short machine/human reason NVIDIA failed (present when fallback is true). */
  fallback_reason?: string;
}

/** One row of the user's configurable supplement list (migration 013). */
export interface UserSupplement {
  id: string;
  user_id: string;
  /** Canonical for built-ins ('creatine', …); database-generated for custom rows. */
  slug: string;
  name: string;
  dose_amount: number | null;
  dose_unit: string | null;
  instructions: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Insert shape: id/timestamps are DB-generated; slug defaults for custom rows. */
export type UserSupplementInsert =
  Partial<Omit<UserSupplement, 'id' | 'created_at' | 'updated_at'>> & {
    user_id: string;
    name: string;
  };

/** Presence row: existing = taken that day; untoggling deletes it. */
export interface SupplementLogRow {
  id: string;
  user_id: string;
  supplement_id: string;
  log_date: string;
  created_at: string;
}

export interface Recommendation {
  id: string;
  user_id: string;
  log_date: string;
  rule_id: string;
  message: string;
  severity: Severity;
  passed: boolean;
  dismissed: boolean;
  created_at: string;
}

export type RecommendationInsert = Omit<Recommendation, 'id' | 'created_at'>;

/* ------------------------------------------------------------------ */
/* FitTrack workout tracking (Training tab)                            */
/* ------------------------------------------------------------------ */

export type ExerciseEquipment =
  | 'Machine'
  | 'Cable'
  | 'Dumbbell'
  | 'Barbell'
  | 'EZ Bar'
  | 'Smith Machine'
  | 'Bodyweight'
  | 'Assisted'
  | 'Kettlebell'
  | 'Landmine'
  | 'Resistance Band'
  | 'Trap Bar'
  | 'Sled'
  | 'Medicine Ball'
  | 'Other';

export interface Exercise {
  id: string;
  name: string;
  muscleGroup: string;
  /** Optional for backward compatibility with workouts saved before catalog v2. */
  equipment?: ExerciseEquipment;
}

export interface SetRecord {
  reps: number;
  weight: number;
  rir: number | null;
  completed: boolean;
}

export interface WorkoutExercise {
  exercise: Exercise;
  sets: SetRecord[];
  targetSets: number;
  targetReps: number;
  targetWeight: number;
}

export interface CardioEquipment {
  id: string;
  name: string;
  category: string;
  description: string;
}

export interface CardioWorkoutExercise {
  equipment: CardioEquipment;
  durationMinutes: number;
  distanceMiles: number;
}

export interface WorkoutState {
  exercises: WorkoutExercise[];
  cardioExercises: CardioWorkoutExercise[];
  date: string;
}

export interface WorkoutHistoryEntry extends WorkoutState {
  id: string;
  loggedAt: string;
  totalSets: number;
  completedSets: number;
  totalCardioMinutes: number;
  totalCardioMiles: number;
}

export type Weekday =
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday'
  | 'Saturday'
  | 'Sunday';

export interface RoutineExercise {
  exercise: Exercise;
  targetSets: number;
  targetReps: number;
  targetWeight: number;
}

export interface RoutineCardioExercise {
  equipment: CardioEquipment;
  durationMinutes: number;
  distanceMiles: number;
}

export interface DailyRoutine {
  day: Weekday;
  name: string;
  exercises: RoutineExercise[];
  cardioExercises: RoutineCardioExercise[];
}

export type WeeklyRoutines = Record<Weekday, DailyRoutine>;

/* Row shapes for the merged FitTrack tables (migration 004). */

export interface WorkoutRow {
  id: string;
  user_id: string;
  workout_date: string;
  status: 'active' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface WorkoutExerciseRow {
  id: string;
  workout_id: string;
  exercise_id: string;
  exercise_name: string;
  muscle_group: string;
  target_sets: number;
  target_reps: number;
  target_weight: number;
  sort_order: number;
}

export interface WorkoutSetRow {
  id: string;
  workout_exercise_id: string;
  set_number: number;
  reps: number;
  weight: number;
  rir: number | null;
  completed: boolean;
  completed_at: string | null;
}

export interface WorkoutCardioRow {
  id: string;
  workout_id: string;
  equipment_id: string;
  equipment_name: string;
  equipment_category: string;
  duration_minutes: number;
  distance_miles: number;
  sort_order: number;
}

export interface RoutineRow {
  id: string;
  user_id: string;
  day_of_week: string;
  name: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoutineUpsertRow {
  user_id: string;
  day_of_week: string;
  name: string;
  updated_at: string;
}

export interface RoutineItemRow {
  id: string;
  routine_id: string;
  item_type: 'strength' | 'cardio';
  exercise_id: string | null;
  exercise_name: string | null;
  muscle_group: string | null;
  target_sets: number | null;
  target_reps: number | null;
  target_weight: number | null;
  cardio_equipment_id: string | null;
  cardio_equipment_name: string | null;
  duration_minutes: number | null;
  distance_miles: number | null;
  sort_order: number;
}

export type RoutineItemInsertRow = Omit<RoutineItemRow, 'id' | 'routine_id'>;
