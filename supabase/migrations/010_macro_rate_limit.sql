-- Server-enforced per-user rate limiting for the calculate-macros Edge Function.
--
-- Ownership & transaction guarantees:
--   * Attempts are recorded per auth.uid(); the caller can NEVER meter (or
--     exhaust) another user's quota because the RPC derives identity from the
--     verified JWT, not from arguments.
--   * The check-and-record step is atomic: a per-user advisory transaction
--     lock serializes concurrent calls, so parallel requests from multiple
--     Edge Function instances cannot exceed the quota. No process memory is
--     involved — safe for any number of instances.
--   * The table has RLS enabled with NO policies: only this SECURITY DEFINER
--     RPC (and the service role) can read or write it.
--
-- Policy constants (single place to adjust): see the DECLARE block below.
--   10 attempts per rolling hour, 30 per UTC day. Successful AND failed
--   provider calls both consume quota (the attempt is recorded before the
--   provider is invoked).

CREATE TABLE IF NOT EXISTS macro_calc_attempts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_macro_calc_attempts_user_time
  ON macro_calc_attempts (user_id, attempted_at DESC);

ALTER TABLE macro_calc_attempts ENABLE ROW LEVEL SECURITY;
-- Deliberately no policies: anon/authenticated roles cannot touch this table
-- directly. Access is only through consume_macro_calc_quota() below.

CREATE OR REPLACE FUNCTION public.consume_macro_calc_quota()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Centralized limits; adjust here only.
  c_hour_limit CONSTANT INT := 10;   -- attempts per rolling hour
  c_day_limit  CONSTANT INT := 30;   -- attempts per UTC day
  v_user UUID := auth.uid();
  v_hour_count INT;
  v_day_count INT;
  v_oldest_in_hour TIMESTAMPTZ;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'consume_macro_calc_quota requires an authenticated user'
      USING ERRCODE = '28000';
  END IF;

  -- Serialize concurrent attempts for this user (atomic check-then-insert).
  PERFORM pg_advisory_xact_lock(hashtextextended('macro_quota:' || v_user::text, 0));

  SELECT count(*), min(attempted_at)
    INTO v_hour_count, v_oldest_in_hour
    FROM macro_calc_attempts
   WHERE user_id = v_user
     AND attempted_at > now() - interval '1 hour';

  SELECT count(*)
    INTO v_day_count
    FROM macro_calc_attempts
   WHERE user_id = v_user
     AND timezone('utc', attempted_at)::date = timezone('utc', now())::date;

  IF v_hour_count >= c_hour_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'hour',
      'retry_after_seconds',
      GREATEST(1, EXTRACT(EPOCH FROM (v_oldest_in_hour + interval '1 hour' - now()))::int)
    );
  END IF;

  IF v_day_count >= c_day_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'day',
      'retry_after_seconds',
      GREATEST(1, EXTRACT(EPOCH FROM (
        (timezone('utc', now())::date + 1)::timestamp AT TIME ZONE 'utc' - now()
      ))::int)
    );
  END IF;

  INSERT INTO macro_calc_attempts (user_id) VALUES (v_user);

  RETURN jsonb_build_object(
    'allowed', true,
    'hour_remaining', c_hour_limit - v_hour_count - 1,
    'day_remaining', c_day_limit - v_day_count - 1
  );
END;
$$;

-- Only signed-in users (and the service role) may execute the quota RPC.
REVOKE ALL ON FUNCTION public.consume_macro_calc_quota() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_macro_calc_quota() FROM anon;
GRANT EXECUTE ON FUNCTION public.consume_macro_calc_quota() TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_macro_calc_quota() TO service_role;

COMMENT ON FUNCTION public.consume_macro_calc_quota() IS
  'Atomically records one calculate-macros attempt for auth.uid() and returns {allowed, ...}. Limits: 10/rolling hour, 30/UTC day (constants in function body).';
