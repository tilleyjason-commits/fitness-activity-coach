-- Named plans, session clock, log types, custom exercises, body measurements,
-- progress photos, overload decisions, and account deletion.
--
-- Additive. Existing save_workout callers that omit the new JSON keys keep
-- working: missing keys fall back to the column defaults.

ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS rest_seconds int,
  ADD COLUMN IF NOT EXISTS exertion smallint,
  ADD COLUMN IF NOT EXISTS session_note text;

ALTER TABLE public.workout_exercises
  ADD COLUMN IF NOT EXISTS log_type text NOT NULL DEFAULT 'weight_reps',
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS rest_seconds int,
  ADD COLUMN IF NOT EXISTS superset_group int;

ALTER TABLE public.workout_sets
  ADD COLUMN IF NOT EXISTS set_type text NOT NULL DEFAULT 'working',
  ADD COLUMN IF NOT EXISTS duration_seconds int;

ALTER TABLE public.workouts DROP CONSTRAINT IF EXISTS workouts_session_bounds;
ALTER TABLE public.workouts
  ADD CONSTRAINT workouts_session_bounds CHECK (
    (rest_seconds IS NULL OR rest_seconds BETWEEN 0 AND 86400)
    AND (exertion IS NULL OR exertion BETWEEN 1 AND 10)
    AND (session_note IS NULL OR char_length(session_note) <= 500)
  ) NOT VALID;

ALTER TABLE public.workout_exercises DROP CONSTRAINT IF EXISTS workout_exercises_log_bounds;
ALTER TABLE public.workout_exercises
  ADD CONSTRAINT workout_exercises_log_bounds CHECK (
    log_type IN ('weight_reps', 'reps', 'duration', 'reps_duration')
    AND (notes IS NULL OR char_length(notes) <= 500)
    AND (rest_seconds IS NULL OR rest_seconds BETWEEN 0 AND 600)
    AND (superset_group IS NULL OR superset_group BETWEEN 1 AND 20)
  ) NOT VALID;

ALTER TABLE public.workout_sets DROP CONSTRAINT IF EXISTS workout_sets_kind_bounds;
ALTER TABLE public.workout_sets
  ADD CONSTRAINT workout_sets_kind_bounds CHECK (
    set_type IN ('working', 'warmup')
    AND (duration_seconds IS NULL OR duration_seconds BETWEEN 0 AND 7200)
  ) NOT VALID;

-- save_workout body is the migration-020 writer, plus optional fields.
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
  v_log_type text;
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
    v_log_type := COALESCE(NULLIF(v_exercise->>'log_type', ''), 'weight_reps');
    IF v_log_type NOT IN ('weight_reps', 'reps', 'duration', 'reps_duration') THEN
      RAISE EXCEPTION 'log_type is invalid';
    END IF;
    IF char_length(COALESCE(v_exercise->>'notes', '')) > 500 THEN
      RAISE EXCEPTION 'exercise note is too long';
    END IF;
    IF v_exercise ? 'rest_seconds'
       AND v_exercise->>'rest_seconds' IS NOT NULL
       AND (v_exercise->>'rest_seconds')::int NOT BETWEEN 0 AND 600 THEN
      RAISE EXCEPTION 'rest_seconds is outside allowed bounds';
    END IF;
    IF v_exercise ? 'superset_group'
       AND v_exercise->>'superset_group' IS NOT NULL
       AND (v_exercise->>'superset_group')::int NOT BETWEEN 1 AND 20 THEN
      RAISE EXCEPTION 'superset_group is outside allowed bounds';
    END IF;

    INSERT INTO workout_exercises
      (workout_id, exercise_id, exercise_name, muscle_group,
       target_sets, target_reps, target_weight, sort_order,
       log_type, notes, rest_seconds, superset_group)
    VALUES
      (v_workout_id, v_exercise->>'exercise_id', v_exercise->>'exercise_name',
       v_exercise->>'muscle_group', (v_exercise->>'target_sets')::int,
       (v_exercise->>'target_reps')::int,
       COALESCE((v_exercise->>'target_weight')::numeric, 0), v_sort_order,
       v_log_type, NULLIF(v_exercise->>'notes', ''),
       (v_exercise->>'rest_seconds')::int,
       (v_exercise->>'superset_group')::int)
    RETURNING id INTO v_exercise_id;

    INSERT INTO workout_sets
      (workout_exercise_id, set_number, reps, weight, rir, completed, set_type, duration_seconds)
    SELECT v_exercise_id,
           COALESCE((s.val->>'set_number')::int, s.ord::int),
           COALESCE((s.val->>'reps')::int, 0),
           COALESCE((s.val->>'weight')::numeric, 0),
           (s.val->>'rir')::int,
           COALESCE((s.val->>'completed')::boolean, false),
           CASE
             WHEN COALESCE(NULLIF(s.val->>'set_type', ''), 'working') IN ('working', 'warmup')
               THEN COALESCE(NULLIF(s.val->>'set_type', ''), 'working')
             ELSE NULL
           END,
           (s.val->>'duration_seconds')::int
      FROM jsonb_array_elements(COALESCE(v_exercise->'sets', '[]'::jsonb))
        WITH ORDINALITY AS s(val, ord);
    IF EXISTS (
      SELECT 1 FROM workout_sets ws
       WHERE ws.workout_exercise_id = v_exercise_id
         AND (ws.set_type IS NULL
              OR (ws.duration_seconds IS NOT NULL AND ws.duration_seconds NOT BETWEEN 0 AND 7200))
    ) THEN
      RAISE EXCEPTION 'workout set type or duration is outside allowed bounds';
    END IF;
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

REVOKE ALL ON FUNCTION public.save_workout(date, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_workout(date, jsonb, jsonb) TO authenticated;

-- ------------------------------------------------------------------
-- Plans, catalog additions, body, photos, overload decisions
-- ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.training_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  focus text NOT NULL DEFAULT 'maintaining'
    CHECK (focus IN ('bulking', 'maintaining', 'cutting', 'sport')),
  level text NOT NULL DEFAULT 'intermediate'
    CHECK (level IN ('beginner', 'intermediate', 'advanced')),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  week_count int NOT NULL DEFAULT 4 CHECK (week_count BETWEEN 1 AND 12),
  current_week int NOT NULL DEFAULT 1 CHECK (current_week BETWEEN 1 AND 12),
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS training_plans_one_active
  ON public.training_plans (user_id) WHERE active;

CREATE TABLE IF NOT EXISTS public.plan_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_index int NOT NULL CHECK (week_index BETWEEN 1 AND 12),
  day_index int NOT NULL CHECK (day_index BETWEEN 0 AND 6),
  weekday text CHECK (weekday IS NULL OR weekday IN (
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
  )),
  name text NOT NULL DEFAULT '' CHECK (char_length(name) <= 120),
  rest_day boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  UNIQUE (plan_id, week_index, day_index),
  UNIQUE (id, user_id),
  FOREIGN KEY (plan_id, user_id) REFERENCES public.training_plans (id, user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.plan_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_day_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_id text NOT NULL CHECK (char_length(exercise_id) BETWEEN 1 AND 120),
  exercise_name text NOT NULL CHECK (char_length(exercise_name) BETWEEN 1 AND 120),
  muscle_group text NOT NULL CHECK (char_length(muscle_group) BETWEEN 1 AND 80),
  equipment text NOT NULL DEFAULT 'Other' CHECK (char_length(equipment) <= 40),
  log_type text NOT NULL DEFAULT 'weight_reps'
    CHECK (log_type IN ('weight_reps', 'reps', 'duration', 'reps_duration')),
  rest_seconds int NOT NULL DEFAULT 90 CHECK (rest_seconds BETWEEN 0 AND 600),
  superset_group int CHECK (superset_group IS NULL OR superset_group BETWEEN 1 AND 20),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 500),
  sort_order int NOT NULL DEFAULT 0,
  UNIQUE (id, user_id),
  FOREIGN KEY (plan_day_id, user_id) REFERENCES public.plan_days (id, user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.plan_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_exercise_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  set_index int NOT NULL CHECK (set_index BETWEEN 1 AND 20),
  set_type text NOT NULL DEFAULT 'working' CHECK (set_type IN ('working', 'warmup')),
  reps int CHECK (reps IS NULL OR reps BETWEEN 0 AND 200),
  weight numeric CHECK (weight IS NULL OR weight BETWEEN 0 AND 2000),
  duration_seconds int CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 0 AND 7200),
  rest_seconds int CHECK (rest_seconds IS NULL OR rest_seconds BETWEEN 0 AND 600),
  UNIQUE (plan_exercise_id, set_index),
  FOREIGN KEY (plan_exercise_id, user_id)
    REFERENCES public.plan_exercises (id, user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.custom_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  muscle_group text NOT NULL CHECK (char_length(muscle_group) BETWEEN 1 AND 80),
  equipment text NOT NULL DEFAULT 'Other' CHECK (char_length(equipment) <= 40),
  log_type text NOT NULL DEFAULT 'weight_reps'
    CHECK (log_type IN ('weight_reps', 'reps', 'duration', 'reps_duration')),
  cue text NOT NULL DEFAULT '' CHECK (char_length(cue) <= 280),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS public.body_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  measured_on date NOT NULL,
  chest_in numeric CHECK (chest_in IS NULL OR chest_in BETWEEN 0 AND 100),
  arm_in numeric CHECK (arm_in IS NULL OR arm_in BETWEEN 0 AND 40),
  thigh_in numeric CHECK (thigh_in IS NULL OR thigh_in BETWEEN 0 AND 50),
  hip_in numeric CHECK (hip_in IS NULL OR hip_in BETWEEN 0 AND 100),
  neck_in numeric CHECK (neck_in IS NULL OR neck_in BETWEEN 0 AND 40),
  calf_in numeric CHECK (calf_in IS NULL OR calf_in BETWEEN 0 AND 40),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 280),
  UNIQUE (user_id, measured_on)
);

CREATE TABLE IF NOT EXISTS public.progress_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  taken_on date NOT NULL,
  storage_path text NOT NULL CHECK (char_length(storage_path) BETWEEN 1 AND 240),
  caption text NOT NULL DEFAULT '' CHECK (char_length(caption) <= 140),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.overload_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_id text NOT NULL CHECK (char_length(exercise_id) BETWEEN 1 AND 120),
  workout_date date NOT NULL,
  decision text NOT NULL CHECK (decision IN ('accept', 'skip')),
  suggested_reps int CHECK (suggested_reps IS NULL OR suggested_reps BETWEEN 0 AND 200),
  suggested_weight numeric CHECK (suggested_weight IS NULL OR suggested_weight BETWEEN 0 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, exercise_id, workout_date)
);

ALTER TABLE public.training_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_plans FORCE ROW LEVEL SECURITY;
ALTER TABLE public.plan_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_days FORCE ROW LEVEL SECURITY;
ALTER TABLE public.plan_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_exercises FORCE ROW LEVEL SECURITY;
ALTER TABLE public.plan_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_sets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.custom_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_exercises FORCE ROW LEVEL SECURITY;
ALTER TABLE public.body_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.body_measurements FORCE ROW LEVEL SECURITY;
ALTER TABLE public.progress_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress_photos FORCE ROW LEVEL SECURITY;
ALTER TABLE public.overload_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overload_decisions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage own training plans" ON public.training_plans;
CREATE POLICY "users manage own training plans" ON public.training_plans
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "users manage own plan days" ON public.plan_days;
CREATE POLICY "users manage own plan days" ON public.plan_days
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "users manage own plan exercises" ON public.plan_exercises;
CREATE POLICY "users manage own plan exercises" ON public.plan_exercises
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "users manage own plan sets" ON public.plan_sets;
CREATE POLICY "users manage own plan sets" ON public.plan_sets
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "users manage own custom exercises" ON public.custom_exercises;
CREATE POLICY "users manage own custom exercises" ON public.custom_exercises
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "users manage own measurements" ON public.body_measurements;
CREATE POLICY "users manage own measurements" ON public.body_measurements
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "users manage own progress photos" ON public.progress_photos;
CREATE POLICY "users manage own progress photos" ON public.progress_photos
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "users manage own overload decisions" ON public.overload_decisions;
CREATE POLICY "users manage own overload decisions" ON public.overload_decisions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.save_training_plan(p_plan jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id uuid;
  v_day jsonb;
  v_exercise jsonb;
  v_set jsonb;
  v_day_id uuid;
  v_exercise_id uuid;
  v_name text;
  v_active boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'save_training_plan requires an authenticated user' USING ERRCODE = '28000';
  END IF;
  IF jsonb_typeof(p_plan) <> 'object' THEN
    RAISE EXCEPTION 'plan payload must be an object';
  END IF;
  v_name := trim(COALESCE(p_plan->>'name', ''));
  IF char_length(v_name) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'plan name must be 1 to 120 characters';
  END IF;
  IF COALESCE(p_plan->>'focus', 'maintaining') NOT IN ('bulking', 'maintaining', 'cutting', 'sport')
     OR COALESCE(p_plan->>'level', 'intermediate') NOT IN ('beginner', 'intermediate', 'advanced')
     OR char_length(COALESCE(p_plan->>'description', '')) > 500
     OR COALESCE((p_plan->>'week_count')::int, 4) NOT BETWEEN 1 AND 12
     OR COALESCE((p_plan->>'current_week')::int, 1) NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'plan header is malformed or outside allowed bounds';
  END IF;
  IF jsonb_typeof(COALESCE(p_plan->'days', '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(COALESCE(p_plan->'days', '[]'::jsonb)) > 84 THEN
    RAISE EXCEPTION 'plan days must be an array of at most 84 days';
  END IF;

  v_active := COALESCE((p_plan->>'active')::boolean, false);
  IF v_active THEN
    UPDATE public.training_plans SET active = false, updated_at = now()
     WHERE user_id = v_user AND active;
  END IF;

  v_id := NULLIF(p_plan->>'id', '')::uuid;
  IF v_id IS NULL THEN
    INSERT INTO public.training_plans
      (user_id, name, focus, level, description, week_count, current_week, active)
    VALUES (
      v_user, v_name,
      COALESCE(p_plan->>'focus', 'maintaining'),
      COALESCE(p_plan->>'level', 'intermediate'),
      COALESCE(p_plan->>'description', ''),
      COALESCE((p_plan->>'week_count')::int, 4),
      COALESCE((p_plan->>'current_week')::int, 1),
      v_active
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE public.training_plans SET
      name = v_name,
      focus = COALESCE(p_plan->>'focus', 'maintaining'),
      level = COALESCE(p_plan->>'level', 'intermediate'),
      description = COALESCE(p_plan->>'description', ''),
      week_count = COALESCE((p_plan->>'week_count')::int, 4),
      current_week = COALESCE((p_plan->>'current_week')::int, 1),
      active = v_active,
      updated_at = now()
    WHERE id = v_id AND user_id = v_user;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'plan not found';
    END IF;
    DELETE FROM public.plan_days WHERE plan_id = v_id AND user_id = v_user;
  END IF;

  FOR v_day IN SELECT value FROM jsonb_array_elements(COALESCE(p_plan->'days', '[]'::jsonb)) LOOP
    IF COALESCE((v_day->>'week_index')::int, 0) NOT BETWEEN 1 AND 12
       OR COALESCE((v_day->>'day_index')::int, -1) NOT BETWEEN 0 AND 6
       OR char_length(COALESCE(v_day->>'name', '')) > 120 THEN
      RAISE EXCEPTION 'plan day is malformed';
    END IF;
    INSERT INTO public.plan_days
      (plan_id, user_id, week_index, day_index, weekday, name, rest_day, sort_order)
    VALUES (
      v_id, v_user,
      (v_day->>'week_index')::int,
      (v_day->>'day_index')::int,
      NULLIF(v_day->>'weekday', ''),
      COALESCE(v_day->>'name', ''),
      COALESCE((v_day->>'rest_day')::boolean, false),
      COALESCE((v_day->>'sort_order')::int, (v_day->>'day_index')::int)
    ) RETURNING id INTO v_day_id;

    IF COALESCE((v_day->>'rest_day')::boolean, false) THEN
      CONTINUE;
    END IF;
    IF jsonb_array_length(COALESCE(v_day->'exercises', '[]'::jsonb)) > 40 THEN
      RAISE EXCEPTION 'a plan day has too many exercises';
    END IF;
    FOR v_exercise IN SELECT value FROM jsonb_array_elements(COALESCE(v_day->'exercises', '[]'::jsonb)) LOOP
      IF char_length(COALESCE(v_exercise->>'exercise_id', '')) NOT BETWEEN 1 AND 120
         OR char_length(COALESCE(v_exercise->>'exercise_name', '')) NOT BETWEEN 1 AND 120
         OR char_length(COALESCE(v_exercise->>'muscle_group', '')) NOT BETWEEN 1 AND 80
         OR COALESCE(v_exercise->>'log_type', 'weight_reps') NOT IN ('weight_reps', 'reps', 'duration', 'reps_duration')
         OR COALESCE((v_exercise->>'rest_seconds')::int, 90) NOT BETWEEN 0 AND 600
         OR char_length(COALESCE(v_exercise->>'notes', '')) > 500
         OR jsonb_array_length(COALESCE(v_exercise->'sets', '[]'::jsonb)) NOT BETWEEN 1 AND 20 THEN
        RAISE EXCEPTION 'plan exercise is malformed or outside allowed bounds';
      END IF;
      INSERT INTO public.plan_exercises (
        plan_day_id, user_id, exercise_id, exercise_name, muscle_group, equipment,
        log_type, rest_seconds, superset_group, notes, sort_order
      ) VALUES (
        v_day_id, v_user,
        v_exercise->>'exercise_id',
        v_exercise->>'exercise_name',
        v_exercise->>'muscle_group',
        COALESCE(NULLIF(v_exercise->>'equipment', ''), 'Other'),
        COALESCE(v_exercise->>'log_type', 'weight_reps'),
        COALESCE((v_exercise->>'rest_seconds')::int, 90),
        (v_exercise->>'superset_group')::int,
        COALESCE(v_exercise->>'notes', ''),
        COALESCE((v_exercise->>'sort_order')::int, 0)
      ) RETURNING id INTO v_exercise_id;

      FOR v_set IN SELECT value FROM jsonb_array_elements(v_exercise->'sets') LOOP
        IF COALESCE((v_set->>'set_index')::int, 0) NOT BETWEEN 1 AND 20
           OR COALESCE(v_set->>'set_type', 'working') NOT IN ('working', 'warmup') THEN
          RAISE EXCEPTION 'plan set is malformed';
        END IF;
        INSERT INTO public.plan_sets (
          plan_exercise_id, user_id, set_index, set_type, reps, weight, duration_seconds, rest_seconds
        ) VALUES (
          v_exercise_id, v_user,
          (v_set->>'set_index')::int,
          COALESCE(v_set->>'set_type', 'working'),
          (v_set->>'reps')::int,
          (v_set->>'weight')::numeric,
          (v_set->>'duration_seconds')::int,
          (v_set->>'rest_seconds')::int
        );
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_active_plan(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'set_active_plan requires an authenticated user' USING ERRCODE = '28000';
  END IF;
  UPDATE public.training_plans SET active = false, updated_at = now()
   WHERE user_id = v_user AND active;
  IF p_id IS NOT NULL THEN
    UPDATE public.training_plans SET active = true, updated_at = now()
     WHERE id = p_id AND user_id = v_user;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'plan not found';
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, storage
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  DELETE FROM storage.objects
   WHERE bucket_id = 'progress-photos'
     AND (storage.foldername(name))[1] = uid::text;
  DELETE FROM public.plan_sets WHERE user_id = uid;
  DELETE FROM public.plan_exercises WHERE user_id = uid;
  DELETE FROM public.plan_days WHERE user_id = uid;
  DELETE FROM public.training_plans WHERE user_id = uid;
  DELETE FROM public.custom_exercises WHERE user_id = uid;
  DELETE FROM public.body_measurements WHERE user_id = uid;
  DELETE FROM public.progress_photos WHERE user_id = uid;
  DELETE FROM public.overload_decisions WHERE user_id = uid;
  DELETE FROM auth.users WHERE id = uid;
END;
$$;

REVOKE ALL ON FUNCTION public.save_training_plan(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_active_plan(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_training_plan(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_active_plan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;

INSERT INTO storage.buckets (id, name, public)
VALUES ('progress-photos', 'progress-photos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "progress photos read own" ON storage.objects;
CREATE POLICY "progress photos read own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'progress-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
DROP POLICY IF EXISTS "progress photos insert own" ON storage.objects;
CREATE POLICY "progress photos insert own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'progress-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
DROP POLICY IF EXISTS "progress photos update own" ON storage.objects;
CREATE POLICY "progress photos update own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'progress-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'progress-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
DROP POLICY IF EXISTS "progress photos delete own" ON storage.objects;
CREATE POLICY "progress photos delete own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'progress-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
