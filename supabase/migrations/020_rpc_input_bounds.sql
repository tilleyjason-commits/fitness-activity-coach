-- Bound workout and routine aggregate payloads at the authenticated RPC and
-- table layers. This migration is additive for existing data: NOT VALID table
-- checks protect new writes without failing deployment on historical rows.

CREATE OR REPLACE FUNCTION public.validate_workout_payload(
  p_exercises jsonb,
  p_cardio jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_exercise jsonb;
  v_set jsonb;
  v_cardio jsonb;
BEGIN
  IF jsonb_typeof(COALESCE(p_exercises, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'exercises must be an array with at most 100 items';
  END IF;
  IF jsonb_array_length(COALESCE(p_exercises, '[]'::jsonb)) > 100 THEN
    RAISE EXCEPTION 'exercises must be an array with at most 100 items';
  END IF;
  IF jsonb_typeof(COALESCE(p_cardio, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'cardio must be an array with at most 25 items';
  END IF;
  IF jsonb_array_length(COALESCE(p_cardio, '[]'::jsonb)) > 25 THEN
    RAISE EXCEPTION 'cardio must be an array with at most 25 items';
  END IF;

  FOR v_exercise IN SELECT value FROM jsonb_array_elements(COALESCE(p_exercises, '[]'::jsonb)) LOOP
    IF jsonb_typeof(v_exercise) <> 'object'
       OR NULLIF(trim(v_exercise->>'exercise_id'), '') IS NULL
       OR char_length(v_exercise->>'exercise_id') > 120
       OR NULLIF(trim(v_exercise->>'exercise_name'), '') IS NULL
       OR char_length(v_exercise->>'exercise_name') > 120
       OR NULLIF(trim(v_exercise->>'muscle_group'), '') IS NULL
       OR char_length(v_exercise->>'muscle_group') > 80 THEN
      RAISE EXCEPTION 'exercise identifiers and names are required and length-bounded';
    END IF;
    IF (v_exercise->>'target_sets') IS NULL
       OR (v_exercise->>'target_sets')::int NOT BETWEEN 1 AND 20
       OR (v_exercise->>'target_reps') IS NULL
       OR (v_exercise->>'target_reps')::int NOT BETWEEN 1 AND 200
       OR COALESCE((v_exercise->>'target_weight')::numeric, 0) NOT BETWEEN 0 AND 2000 THEN
      RAISE EXCEPTION 'exercise targets are outside allowed bounds';
    END IF;
    IF jsonb_typeof(COALESCE(v_exercise->'sets', '[]'::jsonb)) <> 'array' THEN
      RAISE EXCEPTION 'sets must be an array with at most 20 items';
    END IF;
    IF jsonb_array_length(COALESCE(v_exercise->'sets', '[]'::jsonb)) > 20 THEN
      RAISE EXCEPTION 'sets must be an array with at most 20 items';
    END IF;
    FOR v_set IN SELECT value FROM jsonb_array_elements(COALESCE(v_exercise->'sets', '[]'::jsonb)) LOOP
      IF jsonb_typeof(v_set) <> 'object'
         OR COALESCE((v_set->>'set_number')::int, 1) NOT BETWEEN 1 AND 20
         OR COALESCE((v_set->>'reps')::int, 0) NOT BETWEEN 0 AND 1000
         OR COALESCE((v_set->>'weight')::numeric, 0) NOT BETWEEN 0 AND 2000
         OR ((v_set->>'rir') IS NOT NULL AND (v_set->>'rir')::int NOT BETWEEN 0 AND 10)
         OR ((v_set->'completed') IS NOT NULL AND jsonb_typeof(v_set->'completed') <> 'boolean') THEN
        RAISE EXCEPTION 'workout set is malformed or outside allowed bounds';
      END IF;
    END LOOP;
  END LOOP;

  FOR v_cardio IN SELECT value FROM jsonb_array_elements(COALESCE(p_cardio, '[]'::jsonb)) LOOP
    IF jsonb_typeof(v_cardio) <> 'object'
       OR NULLIF(trim(v_cardio->>'equipment_id'), '') IS NULL
       OR char_length(v_cardio->>'equipment_id') > 120
       OR NULLIF(trim(v_cardio->>'equipment_name'), '') IS NULL
       OR char_length(v_cardio->>'equipment_name') > 120
       OR NULLIF(trim(v_cardio->>'equipment_category'), '') IS NULL
       OR char_length(v_cardio->>'equipment_category') > 80
       OR COALESCE((v_cardio->>'duration_minutes')::int, 0) NOT BETWEEN 0 AND 1440
       OR COALESCE((v_cardio->>'distance_miles')::numeric, 0) NOT BETWEEN 0 AND 1000 THEN
      RAISE EXCEPTION 'cardio item is malformed or outside allowed bounds';
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_routine_payload(
  p_name text,
  p_items jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
BEGIN
  IF char_length(COALESCE(p_name, '')) > 120 THEN
    RAISE EXCEPTION 'routine name must be 120 characters or fewer';
  END IF;
  IF jsonb_typeof(COALESCE(p_items, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'routine items must be an array with at most 100 items';
  END IF;
  IF jsonb_array_length(COALESCE(p_items, '[]'::jsonb)) > 100 THEN
    RAISE EXCEPTION 'routine items must be an array with at most 100 items';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    IF jsonb_typeof(v_item) <> 'object'
       OR (v_item->>'item_type') IS NULL
       OR v_item->>'item_type' NOT IN ('strength', 'cardio') THEN
      RAISE EXCEPTION 'routine item has an invalid type';
    END IF;
    IF v_item->>'item_type' = 'strength' AND (
      NULLIF(trim(v_item->>'exercise_id'), '') IS NULL
      OR char_length(v_item->>'exercise_id') > 120
      OR NULLIF(trim(v_item->>'exercise_name'), '') IS NULL
      OR char_length(v_item->>'exercise_name') > 120
      OR NULLIF(trim(v_item->>'muscle_group'), '') IS NULL
      OR char_length(v_item->>'muscle_group') > 80
      OR (v_item->>'target_sets') IS NULL
      OR (v_item->>'target_sets')::int NOT BETWEEN 1 AND 20
      OR (v_item->>'target_reps') IS NULL
      OR (v_item->>'target_reps')::int NOT BETWEEN 1 AND 200
      OR COALESCE((v_item->>'target_weight')::numeric, 0) NOT BETWEEN 0 AND 2000
    ) THEN
      RAISE EXCEPTION 'strength routine item is malformed or outside allowed bounds';
    END IF;
    IF v_item->>'item_type' = 'cardio' AND (
      NULLIF(trim(v_item->>'cardio_equipment_id'), '') IS NULL
      OR char_length(v_item->>'cardio_equipment_id') > 120
      OR NULLIF(trim(v_item->>'cardio_equipment_name'), '') IS NULL
      OR char_length(v_item->>'cardio_equipment_name') > 120
      OR COALESCE((v_item->>'duration_minutes')::int, 0) NOT BETWEEN 0 AND 1440
      OR COALESCE((v_item->>'distance_miles')::numeric, 0) NOT BETWEEN 0 AND 1000
    ) THEN
      RAISE EXCEPTION 'cardio routine item is malformed or outside allowed bounds';
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_workout_payload(jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.validate_routine_payload(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_workout_payload(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_routine_payload(text, jsonb) TO authenticated;

ALTER TABLE public.workout_exercises
  ADD CONSTRAINT workout_exercises_text_bounds CHECK (
    char_length(exercise_id) BETWEEN 1 AND 120
    AND char_length(exercise_name) BETWEEN 1 AND 120
    AND char_length(muscle_group) BETWEEN 1 AND 80
  ) NOT VALID,
  ADD CONSTRAINT workout_exercises_weight_bounds CHECK (target_weight BETWEEN 0 AND 2000) NOT VALID;

ALTER TABLE public.workout_sets
  ADD CONSTRAINT workout_sets_value_bounds CHECK (
    set_number BETWEEN 1 AND 20 AND reps BETWEEN 0 AND 1000 AND weight BETWEEN 0 AND 2000
  ) NOT VALID;

ALTER TABLE public.workout_cardio
  ADD CONSTRAINT workout_cardio_value_bounds CHECK (
    char_length(equipment_id) BETWEEN 1 AND 120
    AND char_length(equipment_name) BETWEEN 1 AND 120
    AND char_length(equipment_category) BETWEEN 1 AND 80
    AND duration_minutes BETWEEN 0 AND 1440
    AND distance_miles BETWEEN 0 AND 1000
  ) NOT VALID;

ALTER TABLE public.routines
  ADD CONSTRAINT routines_name_bounds CHECK (char_length(name) <= 120) NOT VALID;

ALTER TABLE public.routine_items
  ADD CONSTRAINT routine_items_value_bounds CHECK (
    (exercise_id IS NULL OR char_length(exercise_id) BETWEEN 1 AND 120)
    AND (exercise_name IS NULL OR char_length(exercise_name) BETWEEN 1 AND 120)
    AND (muscle_group IS NULL OR char_length(muscle_group) BETWEEN 1 AND 80)
    AND (target_weight IS NULL OR target_weight BETWEEN 0 AND 2000)
    AND (duration_minutes IS NULL OR duration_minutes BETWEEN 0 AND 1440)
    AND (distance_miles IS NULL OR distance_miles BETWEEN 0 AND 1000)
  ) NOT VALID;

-- Recreate save_workout with validation before any lock or write. The write
-- body remains the migration-012 implementation so RLS can observe parents.
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
  v_exercise jsonb;
  v_exercise_id uuid;
  v_sort_order int;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'save_workout requires an authenticated user' USING ERRCODE = '28000';
  END IF;
  IF p_workout_date IS NULL THEN RAISE EXCEPTION 'workout date is required'; END IF;
  PERFORM public.validate_workout_payload(p_exercises, p_cardio);

  PERFORM pg_advisory_xact_lock(
    hashtextextended('save_workout:' || v_user::text || ':' || p_workout_date::text, 0)
  );
  SELECT id INTO v_workout_id FROM workouts
   WHERE user_id = v_user AND workout_date = p_workout_date AND status = 'active'
   ORDER BY created_at DESC LIMIT 1;
  IF v_workout_id IS NULL THEN
    INSERT INTO workouts (user_id, workout_date, status)
    VALUES (v_user, p_workout_date, 'active') RETURNING id INTO v_workout_id;
  ELSE
    UPDATE workouts SET updated_at = now() WHERE id = v_workout_id;
  END IF;

  DELETE FROM workout_exercises WHERE workout_id = v_workout_id;
  DELETE FROM workout_cardio WHERE workout_id = v_workout_id;
  FOR v_exercise, v_sort_order IN
    SELECT t.e, (t.ord - 1)::int FROM jsonb_array_elements(COALESCE(p_exercises, '[]'::jsonb))
      WITH ORDINALITY AS t(e, ord)
  LOOP
    INSERT INTO workout_exercises
      (workout_id, exercise_id, exercise_name, muscle_group,
       target_sets, target_reps, target_weight, sort_order)
    VALUES
      (v_workout_id, v_exercise->>'exercise_id', v_exercise->>'exercise_name',
       v_exercise->>'muscle_group', (v_exercise->>'target_sets')::int,
       (v_exercise->>'target_reps')::int,
       COALESCE((v_exercise->>'target_weight')::numeric, 0), v_sort_order)
    RETURNING id INTO v_exercise_id;
    INSERT INTO workout_sets
      (workout_exercise_id, set_number, reps, weight, rir, completed)
    SELECT v_exercise_id, COALESCE((s.val->>'set_number')::int, s.ord::int),
           COALESCE((s.val->>'reps')::int, 0), COALESCE((s.val->>'weight')::numeric, 0),
           (s.val->>'rir')::int, COALESCE((s.val->>'completed')::boolean, false)
      FROM jsonb_array_elements(COALESCE(v_exercise->'sets', '[]'::jsonb))
        WITH ORDINALITY AS s(val, ord);
  END LOOP;
  INSERT INTO workout_cardio
    (workout_id, equipment_id, equipment_name, equipment_category,
     duration_minutes, distance_miles, sort_order)
  SELECT v_workout_id, t.c->>'equipment_id', t.c->>'equipment_name',
         t.c->>'equipment_category', COALESCE((t.c->>'duration_minutes')::int, 0),
         COALESCE((t.c->>'distance_miles')::numeric, 0), (t.ord - 1)::int
    FROM jsonb_array_elements(COALESCE(p_cardio, '[]'::jsonb)) WITH ORDINALITY AS t(c, ord);
  RETURN v_workout_id;
END;
$$;

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
  PERFORM public.validate_routine_payload(p_name, p_items);
  INSERT INTO routines (user_id, day_of_week, name)
  VALUES (v_user, p_day_of_week, COALESCE(p_name, ''))
  ON CONFLICT (user_id, day_of_week)
  DO UPDATE SET name = EXCLUDED.name, updated_at = now()
  RETURNING id INTO v_routine_id;
  DELETE FROM routine_items WHERE routine_id = v_routine_id;
  INSERT INTO routine_items
    (routine_id, item_type, exercise_id, exercise_name, muscle_group,
     target_sets, target_reps, target_weight, cardio_equipment_id,
     cardio_equipment_name, duration_minutes, distance_miles, sort_order)
  SELECT v_routine_id, t.i->>'item_type', t.i->>'exercise_id', t.i->>'exercise_name',
         t.i->>'muscle_group', (t.i->>'target_sets')::int, (t.i->>'target_reps')::int,
         (t.i->>'target_weight')::numeric, t.i->>'cardio_equipment_id',
         t.i->>'cardio_equipment_name', (t.i->>'duration_minutes')::int,
         (t.i->>'distance_miles')::numeric, COALESCE((t.i->>'sort_order')::int, (t.ord - 1)::int)
    FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) WITH ORDINALITY AS t(i, ord);
  RETURN v_routine_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_workout(date, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_routine(text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_workout(date, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_routine(text, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.validate_workout_payload(jsonb, jsonb) IS
  'Rejects malformed, oversized, negative, or impractical workout aggregate payloads before writes.';
COMMENT ON FUNCTION public.validate_routine_payload(text, jsonb) IS
  'Rejects malformed, oversized, negative, or impractical routine aggregate payloads before writes.';
