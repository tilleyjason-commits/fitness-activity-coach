-- Profile ownership contract.
--
-- The live profiles table has BOTH `id` and `user_id` (user_id is NOT NULL),
-- but the app historically wrote only `id`, so inserting a fresh profile from
-- the setup wizard failed with HTTP 400 (NOT NULL violation on user_id).
--
-- Contract (enforced here, additively and idempotently):
--   * id = auth.uid()       (the app's read key; see src/lib/db.ts getProfile)
--   * user_id = auth.uid()  (the ownership key used by RLS in 007)
--   * id must always equal user_id (CHECK below)
-- The handle_new_user trigger (005) already inserts both columns. RLS from
-- 007 ("id = auth.uid() OR user_id = auth.uid()") is unchanged — with the
-- CHECK constraint both predicates are equivalent, so nothing is weakened.

-- Idempotent when the column already exists (it does in the live schema).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS user_id UUID;

-- Heal any historical rows written before the contract existed.
UPDATE profiles SET user_id = id WHERE user_id IS NULL;

ALTER TABLE profiles ALTER COLUMN user_id SET NOT NULL;

-- CHECK (id = user_id): reject any future write that would split ownership.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_id_matches_user_id'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_id_matches_user_id CHECK (id = user_id);
  END IF;
END $$;

COMMENT ON COLUMN profiles.user_id IS
  'Always equals id and auth.uid(); enforced by profiles_id_matches_user_id. RLS (007) keys ownership on this column.';
