-- Macro tracker: per-meal AI-calculated logs feeding daily_logs totals.

CREATE TABLE meal_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_log_id UUID NOT NULL REFERENCES daily_logs(id) ON DELETE CASCADE,
  meal_slot TEXT NOT NULL CHECK (meal_slot IN ('breakfast','lunch','dinner','post_gym','snack')),
  meal_time TIME,
  raw_input TEXT,                  -- user's natural language description
  total_calories INT DEFAULT 0,
  total_protein_g DECIMAL DEFAULT 0,
  total_carbs_g DECIMAL DEFAULT 0,
  total_fat_g DECIMAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(daily_log_id, meal_slot)
);
ALTER TABLE meal_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own meal logs" ON meal_logs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM daily_logs WHERE daily_logs.id = meal_logs.daily_log_id AND daily_logs.user_id = auth.uid())
  );

CREATE TABLE meal_foods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_log_id UUID NOT NULL REFERENCES meal_logs(id) ON DELETE CASCADE,
  food_name TEXT NOT NULL,
  quantity DECIMAL,
  unit TEXT,
  calories INT NOT NULL,
  protein_g DECIMAL NOT NULL,
  carbs_g DECIMAL NOT NULL,
  fat_g DECIMAL NOT NULL,
  confidence TEXT CHECK (confidence IN ('high','medium','low')),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE meal_foods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own meal foods" ON meal_foods
  FOR ALL USING (
    EXISTS (SELECT 1 FROM meal_logs JOIN daily_logs ON daily_logs.id = meal_logs.daily_log_id
      WHERE meal_logs.id = meal_foods.meal_log_id AND daily_logs.user_id = auth.uid())
  );
