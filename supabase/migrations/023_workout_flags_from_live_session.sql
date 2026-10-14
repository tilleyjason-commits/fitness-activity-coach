-- 023_workout_flags_from_live_session.sql
-- Finishing a live workout now sets barbell_squat_done and barbell_ohp_done on
-- the day's daily_logs row, so the knee/shoulder rules score the session the
-- user actually did instead of the column default (false => always "pass").
--
-- Flags are OR-ed with the existing value: a backfill-form "true" is never
-- erased, and several workouts on one day accumulate.
--
-- Classification uses the stable exercise_id first, then a conservative name
-- match for custom exercises. Split squats, Smith/machine/dumbbell/goblet
-- variants are NOT barbell squats.

CREATE OR REPLACE FUNCTION public.is_barbell_squat(p_exercise_id text, p_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce(p_exercise_id, '') IN ('barbell-back-squat', 'barbell-front-squat', 'barbell-box-squat')
      OR (
        lower(coalesce(p_name, '')) ~ 'squat'
        AND lower(coalesce(p_name, '')) ~ '(barbell|back squat|front squat|box squat)'
        AND lower(coalesce(p_name, '')) !~ '(split|bulgarian|smith|machine|dumbbell|goblet|hack|pendulum|sissy|pistol|bodyweight|kettlebell|landmine|trap)'
      );
$$;

CREATE OR REPLACE FUNCTION public.is_barbell_ohp(p_exercise_id text, p_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce(p_exercise_id, '') IN ('standing-barbell-overhead-press', 'seated-barbell-overhead-press')
      OR (
        lower(coalesce(p_name, '')) ~ '(overhead|military|shoulder) press'
        AND lower(coalesce(p_name, '')) ~ 'barbell'
        AND lower(coalesce(p_name, '')) !~ '(dumbbell|smith|machine|cable|landmine)'
      );
$$;

REVOKE ALL ON FUNCTION public.is_barbell_squat(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_barbell_ohp(text, text) FROM PUBLIC, anon, authenticated;

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
  v_squat boolean;
  v_ohp boolean;
  v_daily_log_id UUID;
BEGIN
  IF NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  v_day_of_week := trim(to_char(NEW.workout_date, 'Day'));

  SELECT
    ROUND(AVG(ws.rir) FILTER (WHERE ws.completed AND is_compound_exercise(we.exercise_name)), 1),
    ROUND(AVG(ws.rir) FILTER (WHERE ws.completed AND NOT is_compound_exercise(we.exercise_name)), 1),
    COALESCE(bool_or(is_barbell_squat(we.exercise_id, we.exercise_name)
                     AND EXISTS (SELECT 1 FROM workout_sets s WHERE s.workout_exercise_id = we.id AND s.completed)), false),
    COALESCE(bool_or(is_barbell_ohp(we.exercise_id, we.exercise_name)
                     AND EXISTS (SELECT 1 FROM workout_sets s WHERE s.workout_exercise_id = we.id AND s.completed)), false)
  INTO v_compound_rir, v_isolation_rir, v_squat, v_ohp
  FROM workout_exercises we
  LEFT JOIN workout_sets ws ON ws.workout_exercise_id = we.id
  WHERE we.workout_id = NEW.id;

  INSERT INTO daily_logs (user_id, log_date, day_of_week, training_done,
                          compound_rir, isolation_rir, barbell_squat_done, barbell_ohp_done)
  VALUES (NEW.user_id, NEW.workout_date, v_day_of_week, true,
          v_compound_rir, v_isolation_rir, v_squat, v_ohp)
  ON CONFLICT (user_id, log_date) DO UPDATE
    SET training_done = true,
        day_of_week = EXCLUDED.day_of_week,
        compound_rir = COALESCE(EXCLUDED.compound_rir, daily_logs.compound_rir),
        isolation_rir = COALESCE(EXCLUDED.isolation_rir, daily_logs.isolation_rir),
        barbell_squat_done = daily_logs.barbell_squat_done OR EXCLUDED.barbell_squat_done,
        barbell_ohp_done = daily_logs.barbell_ohp_done OR EXCLUDED.barbell_ohp_done
  RETURNING id INTO v_daily_log_id;

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

REVOKE ALL ON FUNCTION public.summarize_completed_workout() FROM PUBLIC, anon, authenticated;

-- One-time backfill from workouts already completed through the live logger.
-- OR-only: never clears a flag the user set by hand.
UPDATE public.daily_logs dl
   SET barbell_squat_done = dl.barbell_squat_done OR f.squat,
       barbell_ohp_done   = dl.barbell_ohp_done   OR f.ohp
  FROM (
    SELECT w.user_id, w.workout_date,
           bool_or(is_barbell_squat(we.exercise_id, we.exercise_name)
                   AND EXISTS (SELECT 1 FROM public.workout_sets s WHERE s.workout_exercise_id = we.id AND s.completed)) AS squat,
           bool_or(is_barbell_ohp(we.exercise_id, we.exercise_name)
                   AND EXISTS (SELECT 1 FROM public.workout_sets s WHERE s.workout_exercise_id = we.id AND s.completed)) AS ohp
      FROM public.workouts w
      JOIN public.workout_exercises we ON we.workout_id = w.id
     WHERE w.status = 'completed'
     GROUP BY w.user_id, w.workout_date
  ) f
 WHERE dl.user_id = f.user_id AND dl.log_date = f.workout_date
   AND ((f.squat AND NOT dl.barbell_squat_done) OR (f.ohp AND NOT dl.barbell_ohp_done));
