-- Per-set last-completed reps/weight on routine strength items.
-- Legacy rows keep a single target_reps/target_weight; set_targets is optional
-- and is not backfilled so historical routines stay valid.

ALTER TABLE public.routine_items
  ADD COLUMN IF NOT EXISTS set_targets jsonb;

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
  v_set jsonb;
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
    IF v_item->>'item_type' = 'strength'
       AND jsonb_typeof(v_item->'set_targets') = 'array' THEN
      IF jsonb_array_length(v_item->'set_targets') > 20 THEN
        RAISE EXCEPTION 'set_targets must be an array with at most 20 items';
      END IF;
      FOR v_set IN SELECT value FROM jsonb_array_elements(v_item->'set_targets') LOOP
        IF jsonb_typeof(v_set) <> 'object'
           OR (v_set->>'reps') IS NULL
           OR (v_set->>'reps')::int NOT BETWEEN 0 AND 200
           OR COALESCE((v_set->>'weight')::numeric, 0) NOT BETWEEN 0 AND 2000 THEN
          RAISE EXCEPTION 'set_targets entry is malformed or outside allowed bounds';
        END IF;
      END LOOP;
    ELSIF v_item->>'item_type' = 'strength'
       AND v_item ? 'set_targets'
       AND jsonb_typeof(v_item->'set_targets') <> 'null' THEN
      RAISE EXCEPTION 'set_targets must be an array with at most 20 items';
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
     target_sets, target_reps, target_weight, set_targets, cardio_equipment_id,
     cardio_equipment_name, duration_minutes, distance_miles, sort_order)
  SELECT v_routine_id, t.i->>'item_type', t.i->>'exercise_id', t.i->>'exercise_name',
         t.i->>'muscle_group', (t.i->>'target_sets')::int, (t.i->>'target_reps')::int,
         (t.i->>'target_weight')::numeric,
         CASE WHEN jsonb_typeof(t.i->'set_targets') = 'array' THEN t.i->'set_targets' ELSE NULL END,
         t.i->>'cardio_equipment_id',
         t.i->>'cardio_equipment_name', (t.i->>'duration_minutes')::int,
         (t.i->>'distance_miles')::numeric, COALESCE((t.i->>'sort_order')::int, (t.ord - 1)::int)
    FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) WITH ORDINALITY AS t(i, ord);
  RETURN v_routine_id;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_routine_payload(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_routine(text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_routine_payload(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_routine(text, text, jsonb) TO authenticated;
