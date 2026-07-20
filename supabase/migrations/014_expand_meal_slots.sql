-- Expand meal_logs.meal_slot to the seven canonical slots
-- (adds pre_workout_snack and bedtime_snack).
--
-- Scope: swaps the CHECK constraint only. No table rebuild, no data changes,
-- no RPC/RLS rewrites — save_meal/delete_meal keep relying on this CHECK as
-- the SQL source of truth for slot validation.
--
-- Intentionally NOT idempotent. Supabase migrations run once; if the
-- constraint from 003_meal_logs.sql is absent under its PostgreSQL-generated
-- name, schema history diverged from the repo and this migration must fail
-- closed rather than scan the catalog for lookalike constraints.

ALTER TABLE public.meal_logs
  DROP CONSTRAINT meal_logs_meal_slot_check;

ALTER TABLE public.meal_logs
  ADD CONSTRAINT meal_logs_meal_slot_check CHECK (meal_slot IN (
    'breakfast', 'lunch', 'dinner', 'post_gym', 'snack',
    'pre_workout_snack', 'bedtime_snack'
  ));

COMMENT ON CONSTRAINT meal_logs_meal_slot_check ON public.meal_logs IS
  'Canonical meal slots (7 as of migration 014); SQL source of truth for save_meal/delete_meal slot validation.';
