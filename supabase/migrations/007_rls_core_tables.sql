-- Enable RLS + per-user policies on the Coach's core tables (daily_logs,
-- exercise_logs, recommendations, weekly_summaries, profiles). The FitTrack
-- tables were already covered in 004; this closes the gap on the originals.
--
-- Postgres has no CREATE POLICY IF NOT EXISTS, so each policy uses
-- DROP POLICY IF EXISTS + CREATE POLICY to stay idempotent on re-runs.

ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users manage own daily_logs" ON daily_logs;
CREATE POLICY "users manage own daily_logs" ON daily_logs
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE exercise_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "exercise_logs follow daily_log ownership" ON exercise_logs;
CREATE POLICY "exercise_logs follow daily_log ownership" ON exercise_logs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM daily_logs
      WHERE daily_logs.id = exercise_logs.daily_log_id
        AND daily_logs.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM daily_logs
      WHERE daily_logs.id = exercise_logs.daily_log_id
        AND daily_logs.user_id = auth.uid()
    )
  );

ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users manage own recommendations" ON recommendations;
CREATE POLICY "users manage own recommendations" ON recommendations
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE weekly_summaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users manage own weekly summaries" ON weekly_summaries;
CREATE POLICY "users manage own weekly summaries" ON weekly_summaries
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users manage own profile" ON profiles;
CREATE POLICY "users manage own profile" ON profiles
  FOR ALL USING (id = auth.uid()::text::uuid OR user_id = auth.uid())
  WITH CHECK (id = auth.uid()::text::uuid OR user_id = auth.uid());
