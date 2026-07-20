-- Add columns referenced by the sleep log page that were missing from the original
-- ad-hoc schema creation. The app code references these but the DB never got them.

ALTER TABLE daily_logs
  ADD COLUMN IF NOT EXISTS caffeine_cutoff_respected BOOLEAN,
  ADD COLUMN IF NOT EXISTS last_caffeine_time TIME,
  ADD COLUMN IF NOT EXISTS last_screen_time TIME,
  ADD COLUMN IF NOT EXISTS bedtime TIME,
  ADD COLUMN IF NOT EXISTS waketime TIME,
  ADD COLUMN IF NOT EXISTS early_wake BOOLEAN,
  ADD COLUMN IF NOT EXISTS sleep_quality SMALLINT;
