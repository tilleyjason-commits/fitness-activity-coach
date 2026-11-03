-- 026_profile_coaching_flags.sql
-- Audit follow-up: the knee/shoulder coaching rules encoded one person's injury
-- history and ran for every user. Rules can now declare `requires_flag`, and a
-- rule only applies to profiles that opted in via this column.
-- Idempotent. Per AGENTS.md, apply to the live project first, then merge.
-- Existing users start with no flags; the original author should enable
-- knee_limited / shoulder_limited in Settings to keep the old behavior.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS coaching_flags text[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_coaching_flags_allowed'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_coaching_flags_allowed
      CHECK (coaching_flags <@ ARRAY['knee_limited', 'shoulder_limited']::text[]);
  END IF;
END $$;
