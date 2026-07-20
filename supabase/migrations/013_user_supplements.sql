-- User-configurable supplement lists + per-day taken logs.
--
-- daily_logs supplement booleans are unchanged and remain the read model for
-- the dashboard, rules engine, and weekly summaries. The five built-in slugs
-- ('creatine', 'vitamin-d', 'magnesium', 'omega-3', 'beta-alanine') are kept
-- in sync exclusively inside set_supplement_taken (single transaction,
-- server-side whitelist — the client never dual-writes).
--
-- No default seeding: users explicitly choose built-ins or add custom rows.
-- The backfill below only creates canonical rows for users who actually
-- logged that supplement true at least once, so their history stays visible
-- in the new source of truth.

-- ------------------------------------------------------------------
-- Tables (purely additive)
-- ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_supplements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Built-ins use canonical slugs; custom rows get a generated slug so the
  -- UNIQUE constraint is total and PostgREST upsert can infer it.
  slug text NOT NULL DEFAULT gen_random_uuid()::text,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 80),
  -- All dose fields optional and user-entered: the app never recommends doses.
  dose_amount numeric CHECK (dose_amount IS NULL OR dose_amount > 0),
  dose_unit text CHECK (dose_unit IS NULL OR char_length(dose_unit) <= 20),
  instructions text CHECK (instructions IS NULL OR char_length(instructions) <= 200),
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, slug),
  -- Composite key target so children can reference (id, user_id) together:
  -- cross-user supplement references become invalid at the FK level, not just
  -- under RLS.
  UNIQUE (id, user_id)
);

CREATE TABLE IF NOT EXISTS supplement_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  supplement_id uuid NOT NULL,
  log_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Presence = taken; untoggling deletes the row. Unique key keeps retries
  -- and double-taps idempotent.
  UNIQUE (supplement_id, log_date),
  -- Structural ownership: the child row's user_id must match the parent's.
  FOREIGN KEY (supplement_id, user_id)
    REFERENCES user_supplements (id, user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS supplement_logs_user_date_idx
  ON supplement_logs (user_id, log_date);   -- the daily page's query path

-- Keep updated_at honest without trusting the client.
CREATE OR REPLACE FUNCTION public.touch_user_supplements_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS user_supplements_touch ON user_supplements;
CREATE TRIGGER user_supplements_touch
  BEFORE UPDATE ON user_supplements
  FOR EACH ROW EXECUTE FUNCTION public.touch_user_supplements_updated_at();

-- ------------------------------------------------------------------
-- Row level security (same idempotent pattern as migration 007)
-- ------------------------------------------------------------------

ALTER TABLE user_supplements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users manage own supplements" ON user_supplements;
CREATE POLICY "users manage own supplements" ON user_supplements
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE supplement_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users manage own supplement logs" ON supplement_logs;
-- The EXISTS clause is kept alongside the composite FK: it closes the
-- cross-tenant reference hole under RLS as well as structurally (a user could
-- otherwise insert a row carrying their own user_id but another user's
-- supplement_id if only the plain user_id check applied).
CREATE POLICY "users manage own supplement logs" ON supplement_logs
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM user_supplements s
      WHERE s.id = supplement_logs.supplement_id
        AND s.user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------
-- set_supplement_taken: the ONLY write path for taken/untaken
-- (migration 011 conventions: SECURITY INVOKER, auth.uid() identity,
-- explicit ownership check, idempotent, revoked from anon)
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_supplement_taken(
  p_supplement_id uuid,
  p_log_date date,
  p_taken boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_slug text;
  v_column text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'set_supplement_taken requires an authenticated user'
      USING ERRCODE = '28000';
  END IF;

  IF p_supplement_id IS NULL THEN
    RAISE EXCEPTION 'supplement id is required';
  END IF;

  IF p_log_date IS NULL THEN
    RAISE EXCEPTION 'log date is required';
  END IF;

  IF p_taken IS NULL THEN
    RAISE EXCEPTION 'taken state is required';
  END IF;

  -- Explicit ownership lookup: turns a silent RLS "not found" into a clear
  -- error (same rationale documented in migration 011).
  SELECT slug INTO v_slug
    FROM user_supplements
   WHERE id = p_supplement_id AND user_id = v_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'supplement not found or not owned by caller';
  END IF;

  IF p_taken THEN
    INSERT INTO supplement_logs (user_id, supplement_id, log_date)
    VALUES (v_user, p_supplement_id, p_log_date)
    ON CONFLICT (supplement_id, log_date) DO NOTHING;
  ELSE
    DELETE FROM supplement_logs
     WHERE supplement_id = p_supplement_id AND log_date = p_log_date;
  END IF;

  -- Legacy bridge: the five built-in slugs project onto daily_logs booleans
  -- that the dashboard, rules engine, and weekly summaries read. Same
  -- transaction, so the two representations can never diverge. The column
  -- name comes from this fixed whitelist only — never from user input.
  -- Custom supplements (v_column NULL) never touch daily_logs.
  v_column := CASE v_slug
    WHEN 'creatine'     THEN 'creatine_taken'
    WHEN 'vitamin-d'    THEN 'vitamin_d_taken'
    WHEN 'magnesium'    THEN 'magnesium_taken'
    WHEN 'omega-3'      THEN 'omega3_taken'
    WHEN 'beta-alanine' THEN 'beta_alanine_taken'
  END;
  IF v_column IS NOT NULL THEN
    -- Supabase's hosted Postgres uses an English lc_time setting, so FMDay
    -- matches the client's date-fns format(date, 'EEEE').
    EXECUTE format(
      'INSERT INTO daily_logs (user_id, log_date, day_of_week, %I)
       VALUES ($1, $2, to_char($2::date, ''FMDay''), $3)
       ON CONFLICT (user_id, log_date) DO UPDATE SET %I = EXCLUDED.%I',
      v_column, v_column, v_column
    ) USING v_user, p_log_date, p_taken;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.set_supplement_taken(uuid, date, boolean) IS
  'Toggles one supplement for one day (presence row) and atomically syncs the matching legacy daily_logs boolean for built-in slugs. Ownership from auth.uid(); unique (supplement_id, log_date) keeps retries idempotent.';

REVOKE ALL ON FUNCTION public.set_supplement_taken(uuid, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_supplement_taken(uuid, date, boolean) TO authenticated;

-- ------------------------------------------------------------------
-- Backfill: preserve existing check-ins in the new source of truth
-- ------------------------------------------------------------------
-- For each user who ever logged a built-in true, create the canonical row
-- (active by default) and a presence row per historical true date. Users who
-- never logged a supplement true get nothing. Legacy daily_logs values are
-- read, never altered. ON CONFLICT DO NOTHING makes re-runs safe and — on a
-- re-run — never overrides a user's later deactivate/edit choices.

INSERT INTO user_supplements (user_id, slug, name)
SELECT DISTINCT dl.user_id, b.slug, b.name
  FROM daily_logs dl
  JOIN (VALUES
    ('creatine',     'Creatine'),
    ('vitamin-d',    'Vitamin D'),
    ('magnesium',    'Magnesium'),
    ('omega-3',      'Omega-3'),
    ('beta-alanine', 'Beta-Alanine')
  ) AS b(slug, name) ON (
       (b.slug = 'creatine'     AND dl.creatine_taken)
    OR (b.slug = 'vitamin-d'    AND dl.vitamin_d_taken)
    OR (b.slug = 'magnesium'    AND dl.magnesium_taken)
    OR (b.slug = 'omega-3'      AND dl.omega3_taken)
    OR (b.slug = 'beta-alanine' AND dl.beta_alanine_taken)
  )
ON CONFLICT (user_id, slug) DO NOTHING;

INSERT INTO supplement_logs (user_id, supplement_id, log_date)
SELECT dl.user_id, us.id, dl.log_date
  FROM daily_logs dl
  JOIN user_supplements us ON us.user_id = dl.user_id
 WHERE (us.slug = 'creatine'     AND dl.creatine_taken)
    OR (us.slug = 'vitamin-d'    AND dl.vitamin_d_taken)
    OR (us.slug = 'magnesium'    AND dl.magnesium_taken)
    OR (us.slug = 'omega-3'      AND dl.omega3_taken)
    OR (us.slug = 'beta-alanine' AND dl.beta_alanine_taken)
ON CONFLICT (supplement_id, log_date) DO NOTHING;
