-- Local-bootstrap baseline for the Coach tables that predate migration 002.
--
-- IMPORTANT: This file is not a production migration. Existing environments
-- must continue using their recorded migration history. Apply this baseline
-- only to a new, disposable Supabase-compatible local database, then apply the
-- numbered migrations in order.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
    REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  age integer,
  height_cm numeric,
  weight_lb numeric,
  bodyfat_pct integer,
  goal_bodyfat_pct integer,
  goal_weight_lb numeric,
  training_years integer,
  training_time text DEFAULT '11:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.daily_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  log_date date NOT NULL,
  day_of_week text,
  training_done boolean NOT NULL DEFAULT false,
  training_session_type text,
  compound_rir integer CHECK (compound_rir BETWEEN 0 AND 4),
  isolation_rir integer CHECK (isolation_rir BETWEEN 0 AND 4),
  double_progression_followed boolean,
  barbell_squat_done boolean NOT NULL DEFAULT false,
  barbell_ohp_done boolean NOT NULL DEFAULT false,
  daily_calories integer,
  daily_protein_g numeric,
  daily_carbs_g numeric,
  daily_fat_g numeric,
  pre_gym_snack_time time,
  post_gym_meal_time time,
  snack_3pm_logged boolean NOT NULL DEFAULT false,
  casein_taken boolean NOT NULL DEFAULT false,
  dinner_logged boolean NOT NULL DEFAULT false,
  dinner_plates integer NOT NULL DEFAULT 1,
  dinner_protein_first boolean NOT NULL DEFAULT false,
  candy_cravings_today integer NOT NULL DEFAULT 0,
  creatine_taken boolean NOT NULL DEFAULT false,
  vitamin_d_taken boolean NOT NULL DEFAULT false,
  magnesium_taken boolean NOT NULL DEFAULT false,
  energy_score smallint CHECK (energy_score BETWEEN 1 AND 5),
  stress_score smallint CHECK (stress_score BETWEEN 1 AND 5),
  hunger_score smallint CHECK (hunger_score BETWEEN 1 AND 5),
  weekly_weight_lb numeric,
  weekly_waist_inches numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, log_date)
);

CREATE TABLE public.exercise_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_log_id uuid NOT NULL REFERENCES public.daily_logs(id) ON DELETE CASCADE,
  exercise_name text NOT NULL,
  sets_completed integer,
  target_sets integer,
  reps_completed integer,
  target_reps text,
  weight_lb numeric,
  rir integer,
  notes text
);

CREATE INDEX exercise_logs_daily_log_idx
  ON public.exercise_logs (daily_log_id);

CREATE TABLE public.weekly_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  training_compliance_pct numeric,
  protein_avg_g numeric,
  calories_avg integer,
  casein_compliance_pct numeric,
  snack_3pm_compliance_pct numeric,
  caffeine_cutoff_pct numeric,
  sleep_quality_avg numeric,
  candy_cravings_total integer,
  weight_change_lb numeric,
  waist_change_inches numeric,
  compliance_pct numeric,
  weakest_area text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start)
);

CREATE TABLE public.recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  log_date date NOT NULL,
  rule_id text NOT NULL,
  message text NOT NULL,
  severity text NOT NULL
    CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  passed boolean NOT NULL DEFAULT false,
  dismissed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON SCHEMA public IS
  'Baseline is local-bootstrap only; live schema evolution remains migration-driven.';
