-- Migration: Add columns for new rules from Knowledge Base cross-reference
-- v1.1.0 — 45 rules total

ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS meals_count INT DEFAULT 4;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS compound_rest_sec INT;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS isolation_rest_sec INT;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS session_minutes INT;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS beta_alanine_taken BOOLEAN DEFAULT false;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS omega3_taken BOOLEAN DEFAULT false;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS caffeine_mg INT;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS full_rom_followed BOOLEAN DEFAULT true;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS last_deload_date DATE;
