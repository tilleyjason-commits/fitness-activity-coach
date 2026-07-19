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
  id: string;
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

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'post_gym' | 'snack';

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
