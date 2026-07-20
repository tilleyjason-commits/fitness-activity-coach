Read MERGE_SPEC.md in this project. Also read these files:

- supabase/migrations/002_new_rule_columns.sql
- supabase/migrations/003_meal_logs.sql
- src/lib/types.ts
- src/lib/db.ts
- rules/rules.json

Also read C:\Users\tille\fitness-tracker-mobile\supabase\migrations\001_initial_schema.sql and 002_workout_cardio.sql to understand the FitTrack schema.

IMPORTANT CONTEXT ABOUT THE COACH'S EXISTING SCHEMA (no 001 migration file exists — it was run ad-hoc in the SQL editor):

The Coach already has these tables (created by the user earlier via SQL editor):
- daily_logs (with columns: id, user_id, log_date, day_of_week, training_done, training_session_type, compound_rir, isolation_rir, double_progression_followed, barbell_squat_done, barbell_ohp_done, daily_calories, daily_protein_g, daily_carbs_g, daily_fat_g, plus meal/sleep/supplement fields, plus fields from 002 migration: meals_count, compound_rest_sec, isolation_rest_sec, session_minutes, beta_alanine_taken, omega3_taken, caffeine_mg, full_rom_followed, last_deload_date)
- exercise_logs (id, daily_log_id, exercise_name, sets_completed, target_sets, reps_completed, target_reps, weight_lb, rir, notes)
- weekly_summaries (id, user_id, week_start, training_compliance_pct, etc.)
- recommendations (id, user_id, log_date, rule_id, message, severity, passed, dismissed)
- meal_logs (id, daily_log_id, meal_slot, meal_time, raw_input, total_calories, total_protein_g, total_carbs_g, total_fat_g)
- meal_foods (id, meal_log_id, food_name, quantity, unit, calories, protein_g, carbs_g, fat_g, confidence)
- profiles (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, age INT, height_cm DECIMAL, weight_lb DECIMAL, bodyfat_pct INT, goal_bodyfat_pct INT, goal_weight_lb DECIMAL, training_years INT, training_time TEXT, created_at, updated_at)

There IS an existing auth.users trigger: handle_new_user inserts into profiles. You need to modify it to also insert into user_settings.

Then BUILD:

1. CREATE supabase/migrations/004_merge_fittrack.sql
2. CREATE supabase/migrations/005_fix_user_trigger.sql  
3. CREATE supabase/migrations/006_workout_summary_trigger.sql

IMPORTANT: Since the Coach already has a `handle_new_user` function that only inserts into `profiles`, migration 005 should:
- DROP the existing trigger `on_auth_user_created`
- CREATE OR REPLACE FUNCTION handle_new_user() to also insert into user_settings
- Re-create the trigger

For the compound/isolation exercise classification in the trigger, use this logic:
compound_patterns = ['press', 'row', 'pulldown', 'squat', 'deadlift', 'rdl', 'bench', 'shoulder-press', 'lat-pulldown', 'dumbbell-press', 'Smith press']
Everything else = isolation

Verify by running: cd ~/fitness-activity-coach && npm run build