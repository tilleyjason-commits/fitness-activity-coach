-- Merge FitTrack (fitness-tracker-mobile) schema into the Coach project.
-- FitTrack's public.profiles is intentionally omitted — the Coach already has
-- its own profiles table with a different shape. Everything else is carried
-- over verbatim: user_settings, workouts, workout_exercises, workout_sets,
-- routines, routine_items, workout_cardio.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  default_rest_timer_seconds INT NOT NULL DEFAULT 90 CHECK (default_rest_timer_seconds BETWEEN 1 AND 3600),
  preferred_units TEXT NOT NULL DEFAULT 'lb' CHECK (preferred_units IN ('lb', 'kg')),
  theme TEXT NOT NULL DEFAULT 'dark-neon' CHECK (theme IN ('dark-neon')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workout_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL,
  exercise_name TEXT NOT NULL,
  muscle_group TEXT NOT NULL,
  target_sets INT NOT NULL CHECK (target_sets BETWEEN 1 AND 20),
  target_reps INT NOT NULL CHECK (target_reps BETWEEN 1 AND 200),
  target_weight NUMERIC NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS workout_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_exercise_id UUID NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
  set_number INT NOT NULL,
  reps INT NOT NULL DEFAULT 0,
  weight NUMERIC NOT NULL DEFAULT 0,
  rir INT CHECK (rir BETWEEN 0 AND 10),
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  UNIQUE (workout_exercise_id, set_number)
);

CREATE TABLE IF NOT EXISTS routines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_of_week TEXT NOT NULL CHECK (day_of_week IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, day_of_week)
);

CREATE TABLE IF NOT EXISTS routine_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id UUID NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('strength', 'cardio')),
  exercise_id TEXT,
  exercise_name TEXT,
  muscle_group TEXT,
  target_sets INT,
  target_reps INT,
  target_weight NUMERIC,
  cardio_equipment_id TEXT,
  cardio_equipment_name TEXT,
  duration_minutes INT,
  distance_miles NUMERIC,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS workout_cardio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  equipment_id TEXT NOT NULL,
  equipment_name TEXT NOT NULL,
  equipment_category TEXT NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 0,
  distance_miles NUMERIC NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_workouts_user_date ON workouts (user_id, workout_date);
CREATE INDEX IF NOT EXISTS idx_workout_exercises_workout ON workout_exercises (workout_id);
CREATE INDEX IF NOT EXISTS idx_workout_sets_exercise ON workout_sets (workout_exercise_id);
CREATE INDEX IF NOT EXISTS idx_routine_items_routine ON routine_items (routine_id);
CREATE INDEX IF NOT EXISTS idx_workout_cardio_workout ON workout_cardio (workout_id);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE routine_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_cardio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings are owned by the signed-in user" ON user_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "workouts are owned by the signed-in user" ON workouts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "workout exercises follow workout ownership" ON workout_exercises
  FOR ALL USING (
    EXISTS (SELECT 1 FROM workouts w WHERE w.id = workout_id AND w.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM workouts w WHERE w.id = workout_id AND w.user_id = auth.uid())
  );

CREATE POLICY "workout sets follow workout ownership" ON workout_sets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM workout_exercises we
      JOIN workouts w ON w.id = we.workout_id
      WHERE we.id = workout_exercise_id AND w.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM workout_exercises we
      JOIN workouts w ON w.id = we.workout_id
      WHERE we.id = workout_exercise_id AND w.user_id = auth.uid()
    )
  );

CREATE POLICY "routines are owned by the signed-in user" ON routines
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "routine items follow routine ownership" ON routine_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM routines r WHERE r.id = routine_id AND r.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM routines r WHERE r.id = routine_id AND r.user_id = auth.uid())
  );

CREATE POLICY "workout cardio follows workout ownership" ON workout_cardio
  FOR ALL USING (
    EXISTS (SELECT 1 FROM workouts w WHERE w.id = workout_id AND w.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM workouts w WHERE w.id = workout_id AND w.user_id = auth.uid())
  );
