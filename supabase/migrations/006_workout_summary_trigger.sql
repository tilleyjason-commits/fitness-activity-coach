-- When a FitTrack workout is marked completed, summarize it into the Coach's
-- daily_logs + exercise_logs so the 45-rule evaluation engine sees real data.
--
-- Note: workout_exercises rows are all strength work — cardio lives in
-- workout_cardio — so no item_type filter is needed here.

-- Compound vs isolation classification by exercise name. Matches the agreed
-- pattern list (press, row, pulldown, squat, deadlift, rdl, bench — which
-- covers shoulder-press, lat-pulldown, dumbbell-press, Smith press, etc.).
-- Everything else counts as isolation.
CREATE OR REPLACE FUNCTION public.is_compound_exercise(p_name TEXT)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(coalesce(p_name, '')) ~ '(press|row|pulldown|squat|deadlift|rdl|bench)';
$$;

CREATE OR REPLACE FUNCTION public.summarize_completed_workout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day_of_week TEXT;
  v_compound_rir NUMERIC;
  v_isolation_rir NUMERIC;
  v_daily_log_id UUID;
BEGIN
  -- Only fire on transition into 'completed'.
  IF NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  v_day_of_week := trim(to_char(NEW.workout_date, 'Day'));

  SELECT
    ROUND(AVG(ws.rir) FILTER (WHERE ws.completed AND is_compound_exercise(we.exercise_name)), 1),
    ROUND(AVG(ws.rir) FILTER (WHERE ws.completed AND NOT is_compound_exercise(we.exercise_name)), 1)
  INTO v_compound_rir, v_isolation_rir
  FROM workout_exercises we
  JOIN workout_sets ws ON ws.workout_exercise_id = we.id
  WHERE we.workout_id = NEW.id;

  INSERT INTO daily_logs (user_id, log_date, day_of_week, training_done, compound_rir, isolation_rir)
  VALUES (NEW.user_id, NEW.workout_date, v_day_of_week, true, v_compound_rir, v_isolation_rir)
  ON CONFLICT (user_id, log_date) DO UPDATE
    SET training_done = true,
        day_of_week = EXCLUDED.day_of_week,
        compound_rir = COALESCE(EXCLUDED.compound_rir, daily_logs.compound_rir),
        isolation_rir = COALESCE(EXCLUDED.isolation_rir, daily_logs.isolation_rir)
  RETURNING id INTO v_daily_log_id;

  -- FitTrack becomes the source of truth for the day's exercises: replace any
  -- previous entries (manual or from an earlier completion of this workout).
  DELETE FROM exercise_logs WHERE daily_log_id = v_daily_log_id;

  INSERT INTO exercise_logs (
    daily_log_id, exercise_name, sets_completed, target_sets,
    reps_completed, target_reps, weight_lb, rir
  )
  SELECT
    v_daily_log_id,
    we.exercise_name,
    COUNT(ws.id) FILTER (WHERE ws.completed),
    we.target_sets,
    MAX(ws.reps) FILTER (WHERE ws.completed),
    we.target_reps::TEXT,
    MAX(ws.weight) FILTER (WHERE ws.completed),
    ROUND(AVG(ws.rir) FILTER (WHERE ws.completed))
  FROM workout_exercises we
  LEFT JOIN workout_sets ws ON ws.workout_exercise_id = we.id
  WHERE we.workout_id = NEW.id
  GROUP BY we.id, we.exercise_name, we.target_sets, we.target_reps;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_workout_completed ON workouts;
CREATE TRIGGER on_workout_completed
  AFTER INSERT OR UPDATE OF status ON workouts
  FOR EACH ROW EXECUTE FUNCTION public.summarize_completed_workout();
