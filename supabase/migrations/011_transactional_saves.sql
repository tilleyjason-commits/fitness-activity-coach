-- Transactional replacement writes for every multi-step aggregate save.
--
-- Before this migration the app did client-side delete-then-insert for
-- workout children, routine items, meal foods, and exercise logs: a failure
-- (or tab close) between the DELETE and the INSERT silently destroyed data,
-- and overlapping retries could duplicate aggregates.
--
-- Guarantees shared by every RPC below:
--   * OWNERSHIP — identity always comes from auth.uid(); client-supplied user
--     ids are never accepted. Aggregates addressed by id (daily_log_id) are
--     verified to belong to auth.uid() before any write, so cross-user ids
--     are rejected. All functions are SECURITY INVOKER, so the caller's RLS
--     policies (migrations 003/004/007) still apply to every statement.
--   * ATOMICITY — each RPC is one PostgreSQL function call and therefore one
--     transaction: the delete and re-insert either both happen or neither.
--   * IDEMPOTENCY — aggregates are addressed by stable natural keys
--     ((user, date, 'active') for workouts via an advisory lock,
--     (user_id, day_of_week) for routines, (daily_log_id, meal_slot) for
--     meals, daily_log_id for exercise logs), so a retry replaces the same
--     aggregate instead of duplicating it.
--
-- The frontend (src/lib/db.ts, src/lib/workout-repo.ts) has NO fallback path:
-- if an RPC is missing or fails, the save surfaces a visible, retryable error.

-- ------------------------------------------------------------------
-- save_workout: the date's active workout + exercises + sets + cardio
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_workout(
  p_workout_date date,
  p_exercises jsonb DEFAULT '[]'::jsonb,
  p_cardio jsonb DEFAULT '[]'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_workout_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'save_workout requires an authenticated user' USING ERRCODE = '28000';
  END IF;
  IF p_workout_date IS NULL THEN
    RAISE EXCEPTION 'workout date is required';
  END IF;

  -- workouts has no UNIQUE (user_id, workout_date, status): serialize
  -- concurrent saves for the same user+date so retries and overlapping
  -- autosaves can never create duplicate active workouts.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('save_workout:' || v_user::text || ':' || p_workout_date::text, 0)
  );

  SELECT id INTO v_workout_id
    FROM workouts
   WHERE user_id = v_user AND workout_date = p_workout_date AND status = 'active'
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_workout_id IS NULL THEN
    INSERT INTO workouts (user_id, workout_date, status)
    VALUES (v_user, p_workout_date, 'active')
    RETURNING id INTO v_workout_id;
  ELSE
    UPDATE workouts SET updated_at = now() WHERE id = v_workout_id;
  END IF;

  -- Atomic replace: same transaction as the inserts below.
  DELETE FROM workout_exercises WHERE workout_id = v_workout_id; -- sets cascade
  DELETE FROM workout_cardio WHERE workout_id = v_workout_id;

  WITH ex AS (
    SELECT t.e AS e, (t.ord - 1)::int AS sort_order
      FROM jsonb_array_elements(COALESCE(p_exercises, '[]'::jsonb)) WITH ORDINALITY AS t(e, ord)
  ), inserted AS (
    INSERT INTO workout_exercises
      (workout_id, exercise_id, exercise_name, muscle_group,
       target_sets, target_reps, target_weight, sort_order)
    SELECT v_workout_id,
           ex.e->>'exercise_id',
           ex.e->>'exercise_name',
           ex.e->>'muscle_group',
           (ex.e->>'target_sets')::int,
           (ex.e->>'target_reps')::int,
           COALESCE((ex.e->>'target_weight')::numeric, 0),
           ex.sort_order
      FROM ex
    RETURNING id, sort_order
  )
  INSERT INTO workout_sets (workout_exercise_id, set_number, reps, weight, rir, completed)
  SELECT i.id,
         COALESCE((s.val->>'set_number')::int, s.ord::int),
         COALESCE((s.val->>'reps')::int, 0),
         COALESCE((s.val->>'weight')::numeric, 0),
         (s.val->>'rir')::int,
         COALESCE((s.val->>'completed')::boolean, false)
    FROM inserted i
    JOIN ex ON ex.sort_order = i.sort_order
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ex.e->'sets', '[]'::jsonb))
      WITH ORDINALITY AS s(val, ord);

  INSERT INTO workout_cardio
    (workout_id, equipment_id, equipment_name, equipment_category,
     duration_minutes, distance_miles, sort_order)
  SELECT v_workout_id,
         t.c->>'equipment_id',
         t.c->>'equipment_name',
         t.c->>'equipment_category',
         COALESCE((t.c->>'duration_minutes')::int, 0),
         COALESCE((t.c->>'distance_miles')::numeric, 0),
         (t.ord - 1)::int
    FROM jsonb_array_elements(COALESCE(p_cardio, '[]'::jsonb)) WITH ORDINALITY AS t(c, ord);

  RETURN v_workout_id;
END;
$$;

COMMENT ON FUNCTION public.save_workout(date, jsonb, jsonb) IS
  'Atomically replaces the caller''s active workout aggregate for a date. Ownership from auth.uid(); advisory lock makes retries idempotent (no duplicate active workouts).';

-- ------------------------------------------------------------------
-- save_routine: one weekday preset + its items
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_routine(
  p_day_of_week text,
  p_name text DEFAULT '',
  p_items jsonb DEFAULT '[]'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_routine_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'save_routine requires an authenticated user' USING ERRCODE = '28000';
  END IF;

  -- UNIQUE (user_id, day_of_week) makes this upsert idempotent on retry.
  INSERT INTO routines (user_id, day_of_week, name)
  VALUES (v_user, p_day_of_week, COALESCE(p_name, ''))
  ON CONFLICT (user_id, day_of_week)
  DO UPDATE SET name = EXCLUDED.name, updated_at = now()
  RETURNING id INTO v_routine_id;

  DELETE FROM routine_items WHERE routine_id = v_routine_id;

  INSERT INTO routine_items
    (routine_id, item_type, exercise_id, exercise_name, muscle_group,
     target_sets, target_reps, target_weight,
     cardio_equipment_id, cardio_equipment_name, duration_minutes, distance_miles,
     sort_order)
  SELECT v_routine_id,
         t.i->>'item_type',
         t.i->>'exercise_id',
         t.i->>'exercise_name',
         t.i->>'muscle_group',
         (t.i->>'target_sets')::int,
         (t.i->>'target_reps')::int,
         (t.i->>'target_weight')::numeric,
         t.i->>'cardio_equipment_id',
         t.i->>'cardio_equipment_name',
         (t.i->>'duration_minutes')::int,
         (t.i->>'distance_miles')::numeric,
         COALESCE((t.i->>'sort_order')::int, (t.ord - 1)::int)
    FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) WITH ORDINALITY AS t(i, ord);

  RETURN v_routine_id;
END;
$$;

COMMENT ON FUNCTION public.save_routine(text, text, jsonb) IS
  'Atomically upserts the caller''s routine for a weekday and replaces its items. Ownership from auth.uid(); UNIQUE (user_id, day_of_week) keeps retries idempotent.';

-- Shared helper: recompute daily_logs macro columns from saved meals. Define it
-- before save_meal/delete_meal so migration validation never depends on
-- deferred PL/pgSQL name resolution.
CREATE OR REPLACE FUNCTION public.resync_daily_totals(p_daily_log_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_count int;
  v_calories int;
  v_protein numeric;
  v_carbs numeric;
  v_fat numeric;
BEGIN
  SELECT count(*),
         COALESCE(ROUND(SUM(total_calories))::int, 0),
         COALESCE(ROUND(SUM(total_protein_g), 1), 0),
         COALESCE(ROUND(SUM(total_carbs_g), 1), 0),
         COALESCE(ROUND(SUM(total_fat_g), 1), 0)
    INTO v_count, v_calories, v_protein, v_carbs, v_fat
    FROM meal_logs
   WHERE daily_log_id = p_daily_log_id;

  IF v_count = 0 THEN
    UPDATE daily_logs
       SET daily_calories = NULL, daily_protein_g = NULL,
           daily_carbs_g = NULL, daily_fat_g = NULL
     WHERE id = p_daily_log_id;
  ELSE
    UPDATE daily_logs
       SET daily_calories = v_calories, daily_protein_g = v_protein,
           daily_carbs_g = v_carbs, daily_fat_g = v_fat
     WHERE id = p_daily_log_id;
  END IF;
END;
$$;

-- ------------------------------------------------------------------
-- save_meal: one meal slot + foods + daily totals resync
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_meal(
  p_daily_log_id uuid,
  p_meal_slot text,
  p_meal_time time DEFAULT NULL,
  p_raw_input text DEFAULT NULL,
  p_foods jsonb DEFAULT '[]'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_meal_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'save_meal requires an authenticated user' USING ERRCODE = '28000';
  END IF;
  -- Reject cross-user daily-log ids explicitly (RLS would hide the row; this
  -- turns that into a clear error instead of a confusing "not found" insert).
  IF NOT EXISTS (
    SELECT 1 FROM daily_logs WHERE id = p_daily_log_id AND user_id = v_user
  ) THEN
    RAISE EXCEPTION 'daily log not found or not owned by caller';
  END IF;

  -- Totals are computed here from the food rows so they can never disagree.
  INSERT INTO meal_logs
    (daily_log_id, meal_slot, meal_time, raw_input,
     total_calories, total_protein_g, total_carbs_g, total_fat_g)
  SELECT p_daily_log_id, p_meal_slot, p_meal_time, NULLIF(p_raw_input, ''),
         COALESCE(ROUND(SUM((f->>'calories')::numeric))::int, 0),
         COALESCE(ROUND(SUM((f->>'protein_g')::numeric), 1), 0),
         COALESCE(ROUND(SUM((f->>'carbs_g')::numeric), 1), 0),
         COALESCE(ROUND(SUM((f->>'fat_g')::numeric), 1), 0)
    FROM jsonb_array_elements(COALESCE(p_foods, '[]'::jsonb)) AS f
  ON CONFLICT (daily_log_id, meal_slot)
  DO UPDATE SET meal_time = EXCLUDED.meal_time,
                raw_input = EXCLUDED.raw_input,
                total_calories = EXCLUDED.total_calories,
                total_protein_g = EXCLUDED.total_protein_g,
                total_carbs_g = EXCLUDED.total_carbs_g,
                total_fat_g = EXCLUDED.total_fat_g
  RETURNING id INTO v_meal_id;

  DELETE FROM meal_foods WHERE meal_log_id = v_meal_id;

  INSERT INTO meal_foods
    (meal_log_id, food_name, quantity, unit, calories, protein_g, carbs_g, fat_g, confidence)
  SELECT v_meal_id,
         COALESCE(NULLIF(trim(f->>'food_name'), ''), 'Unknown food'),
         (f->>'quantity')::numeric,
         NULLIF(f->>'unit', ''),
         COALESCE(ROUND((f->>'calories')::numeric)::int, 0),
         COALESCE((f->>'protein_g')::numeric, 0),
         COALESCE((f->>'carbs_g')::numeric, 0),
         COALESCE((f->>'fat_g')::numeric, 0),
         CASE WHEN f->>'confidence' IN ('high','medium','low') THEN f->>'confidence' END
    FROM jsonb_array_elements(COALESCE(p_foods, '[]'::jsonb)) AS f;

  PERFORM public.resync_daily_totals(p_daily_log_id);

  RETURN v_meal_id;
END;
$$;

COMMENT ON FUNCTION public.save_meal(uuid, text, time, text, jsonb) IS
  'Atomically replaces one meal slot (log + foods) and resyncs the day''s macro totals. Ownership verified against auth.uid(); UNIQUE (daily_log_id, meal_slot) keeps retries idempotent.';

-- ------------------------------------------------------------------
-- delete_meal: remove one slot + daily totals resync
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_meal(
  p_daily_log_id uuid,
  p_meal_slot text
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'delete_meal requires an authenticated user' USING ERRCODE = '28000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM daily_logs WHERE id = p_daily_log_id AND user_id = v_user
  ) THEN
    RAISE EXCEPTION 'daily log not found or not owned by caller';
  END IF;

  DELETE FROM meal_logs WHERE daily_log_id = p_daily_log_id AND meal_slot = p_meal_slot;
  PERFORM public.resync_daily_totals(p_daily_log_id);
END;
$$;

COMMENT ON FUNCTION public.delete_meal(uuid, text) IS
  'Atomically deletes one meal slot (foods cascade) and resyncs the day''s macro totals. Ownership verified against auth.uid().';

-- ------------------------------------------------------------------
-- replace_exercise_logs: one training session's manual exercise entries
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.replace_exercise_logs(
  p_daily_log_id uuid,
  p_entries jsonb DEFAULT '[]'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'replace_exercise_logs requires an authenticated user' USING ERRCODE = '28000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM daily_logs WHERE id = p_daily_log_id AND user_id = v_user
  ) THEN
    RAISE EXCEPTION 'daily log not found or not owned by caller';
  END IF;

  DELETE FROM exercise_logs WHERE daily_log_id = p_daily_log_id;

  INSERT INTO exercise_logs
    (daily_log_id, exercise_name, sets_completed, target_sets,
     reps_completed, target_reps, weight_lb, rir, notes)
  SELECT p_daily_log_id,
         e->>'exercise_name',
         (e->>'sets_completed')::int,
         (e->>'target_sets')::int,
         (e->>'reps_completed')::int,
         e->>'target_reps',
         (e->>'weight_lb')::numeric,
         (e->>'rir')::int,
         NULLIF(e->>'notes', '')
    FROM jsonb_array_elements(COALESCE(p_entries, '[]'::jsonb)) AS e;
END;
$$;

COMMENT ON FUNCTION public.replace_exercise_logs(uuid, jsonb) IS
  'Atomically replaces the exercise entries of one daily log. Ownership verified against auth.uid(); keyed by daily_log_id so retries are idempotent.';

-- Hygiene: these RPCs are for signed-in users only.
REVOKE ALL ON FUNCTION public.save_workout(date, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_routine(text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_meal(uuid, text, time, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_meal(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.replace_exercise_logs(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resync_daily_totals(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_workout(date, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_routine(text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_meal(uuid, text, time, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_meal(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_exercise_logs(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resync_daily_totals(uuid) TO authenticated;
