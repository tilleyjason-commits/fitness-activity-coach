-- Correct save_workout so workout_sets RLS can observe each parent exercise.
--
-- Migration 011 inserted workout_exercises and workout_sets in one
-- data-modifying CTE statement. PostgreSQL evaluates that statement against one
-- command snapshot, so the workout_sets WITH CHECK policy could not see the
-- exercise inserted by the sibling CTE and rejected valid authenticated saves.
--
-- Insert each exercise in its own statement, then insert its sets in the next
-- statement. Both statements still execute inside the same function call and
-- transaction, preserving atomic replacement and rollback behavior.

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
  IF p_workout_date IS NULL THEN
    RAISE EXCEPTION 'workout date is required';
  END IF;

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

  DELETE FROM workout_exercises WHERE workout_id = v_workout_id; -- sets cascade
  DELETE FROM workout_cardio WHERE workout_id = v_workout_id;

  FOR v_exercise, v_sort_order IN
    SELECT t.e, (t.ord - 1)::int
      FROM jsonb_array_elements(COALESCE(p_exercises, '[]'::jsonb))
        WITH ORDINALITY AS t(e, ord)
  LOOP
    INSERT INTO workout_exercises
      (workout_id, exercise_id, exercise_name, muscle_group,
       target_sets, target_reps, target_weight, sort_order)
    VALUES
      (v_workout_id,
       v_exercise->>'exercise_id',
       v_exercise->>'exercise_name',
       v_exercise->>'muscle_group',
       (v_exercise->>'target_sets')::int,
       (v_exercise->>'target_reps')::int,
       COALESCE((v_exercise->>'target_weight')::numeric, 0),
       v_sort_order)
    RETURNING id INTO v_exercise_id;

    -- This is a separate SQL statement, so the RLS ownership subquery can see
    -- the parent workout_exercises row inserted immediately above.
    INSERT INTO workout_sets
      (workout_exercise_id, set_number, reps, weight, rir, completed)
    SELECT v_exercise_id,
           COALESCE((s.val->>'set_number')::int, s.ord::int),
           COALESCE((s.val->>'reps')::int, 0),
           COALESCE((s.val->>'weight')::numeric, 0),
           (s.val->>'rir')::int,
           COALESCE((s.val->>'completed')::boolean, false)
      FROM jsonb_array_elements(COALESCE(v_exercise->'sets', '[]'::jsonb))
        WITH ORDINALITY AS s(val, ord);
  END LOOP;

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
    FROM jsonb_array_elements(COALESCE(p_cardio, '[]'::jsonb))
      WITH ORDINALITY AS t(c, ord);

  RETURN v_workout_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_workout(date, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_workout(date, jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION public.save_workout(date, jsonb, jsonb) IS
  'Atomically replaces the caller''s active workout aggregate for a date. Exercises and sets use separate statements so workout_sets RLS can verify parent ownership; advisory locking keeps retries idempotent.';
