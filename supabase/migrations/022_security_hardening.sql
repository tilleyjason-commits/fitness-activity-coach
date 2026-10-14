-- 022_security_hardening.sql
-- Findings from the 2026-10-13 audit. All statements are idempotent.
--
-- 1. Trigger-only SECURITY DEFINER functions were callable over /rest/v1/rpc
--    by anon and authenticated. Triggers do not need EXECUTE at fire time, so
--    revoke it from every API role.
-- 2. The two helper functions without a pinned search_path now have one.
-- 3. macro_calc_attempts has RLS with no policy (only consume_macro_calc_quota
--    writes it). Supabase default grants still gave anon/authenticated table
--    privileges; remove them so RLS is not the only barrier.
-- 4. Duplicate permissive FOR ALL policies are dropped (the older twin had no
--    WITH CHECK). Remaining policies are scoped TO authenticated.
--
-- Deliberately NOT done: FORCE ROW LEVEL SECURITY. The table owner (postgres)
-- has BYPASSRLS on Supabase, so FORCE is a no-op there, and PostgREST never
-- connects as the owner.

-- 1. Trigger-only definer functions
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.summarize_completed_workout() FROM PUBLIC, anon, authenticated;
-- consume_macro_calc_quota stays executable by authenticated (the Edge Function
-- calls it with the caller's JWT); make sure PUBLIC/anon never regain it.
REVOKE ALL ON FUNCTION public.consume_macro_calc_quota() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_macro_calc_quota() TO authenticated, service_role;

-- 2. Pin search_path on the remaining helpers
ALTER FUNCTION public.is_compound_exercise(text) SET search_path = public;
ALTER FUNCTION public.touch_user_supplements_updated_at() SET search_path = public;

-- 3. No direct client access to the rate-limit ledger
REVOKE ALL ON TABLE public.macro_calc_attempts FROM PUBLIC, anon, authenticated;

-- 4a. Drop the older duplicate policies
DROP POLICY IF EXISTS "users can manage own daily logs"        ON public.daily_logs;
DROP POLICY IF EXISTS "users can manage own exercise logs"     ON public.exercise_logs;
DROP POLICY IF EXISTS "users can manage own profile"           ON public.profiles;
DROP POLICY IF EXISTS "users can manage own recommendations"   ON public.recommendations;
DROP POLICY IF EXISTS "users can manage own weekly summaries"  ON public.weekly_summaries;

-- 4b. Child tables that had USING only: add an explicit WITH CHECK
DROP POLICY IF EXISTS "users manage own meal foods" ON public.meal_foods;
CREATE POLICY "users manage own meal foods" ON public.meal_foods
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.meal_logs ml
    JOIN public.daily_logs dl ON dl.id = ml.daily_log_id
    WHERE ml.id = meal_foods.meal_log_id AND dl.user_id = auth.uid()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.meal_logs ml
    JOIN public.daily_logs dl ON dl.id = ml.daily_log_id
    WHERE ml.id = meal_foods.meal_log_id AND dl.user_id = auth.uid()));

DROP POLICY IF EXISTS "users manage own meal logs" ON public.meal_logs;
CREATE POLICY "users manage own meal logs" ON public.meal_logs
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.daily_logs dl
    WHERE dl.id = meal_logs.daily_log_id AND dl.user_id = auth.uid()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.daily_logs dl
    WHERE dl.id = meal_logs.daily_log_id AND dl.user_id = auth.uid()));

-- 4c. Profiles: id and user_id must both be the caller (every live row has
--     id = user_id; previously either column alone satisfied the check).
DROP POLICY IF EXISTS "users manage own profile" ON public.profiles;
CREATE POLICY "users manage own profile" ON public.profiles
  FOR ALL TO authenticated
  USING (id = auth.uid() AND user_id = auth.uid())
  WITH CHECK (id = auth.uid() AND user_id = auth.uid());

-- 4d. Scope every surviving policy to authenticated (they were {public}).
ALTER POLICY "users manage own daily_logs"                ON public.daily_logs         TO authenticated;
ALTER POLICY "exercise_logs follow daily_log ownership"   ON public.exercise_logs      TO authenticated;
ALTER POLICY "users manage own recommendations"           ON public.recommendations    TO authenticated;
ALTER POLICY "users manage own weekly summaries"          ON public.weekly_summaries   TO authenticated;
ALTER POLICY "routine items follow routine ownership"     ON public.routine_items      TO authenticated;
ALTER POLICY "routines are owned by the signed-in user"   ON public.routines           TO authenticated;
ALTER POLICY "users manage own supplement logs"           ON public.supplement_logs    TO authenticated;
ALTER POLICY "settings are owned by the signed-in user"   ON public.user_settings      TO authenticated;
ALTER POLICY "users manage own supplements"               ON public.user_supplements   TO authenticated;
ALTER POLICY "workout cardio follows workout ownership"   ON public.workout_cardio     TO authenticated;
ALTER POLICY "workout exercises follow workout ownership" ON public.workout_exercises  TO authenticated;
ALTER POLICY "workout sets follow workout ownership"      ON public.workout_sets       TO authenticated;
ALTER POLICY "workouts are owned by the signed-in user"   ON public.workouts           TO authenticated;
