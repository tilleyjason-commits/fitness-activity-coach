# Option 1: Merge FitTrack into Coach Project — Build Spec

## Goal
Merge the fitness-tracker-mobile (FitTrack) app into the existing fitness-activity-coach Supabase project so workouts logged in FitTrack automatically populate the Coach's evaluation engine.

## Architecture
```
FitTrack app (localhost:5173 or GH Pages)
  → writes to workouts / workout_exercises / workout_sets (shared Supabase)
  → Postgres trigger on workout completion
  → auto-upserts daily_logs + exercise_logs in Coach schema
  → Coach's 45-rule evaluation engine reads the data
  → Dashboard compliance dots update automatically

Coach app (GH Pages)
  → reads from daily_logs + exercise_logs
  → AI macro tracker
  → sleep / supplement / weight logging
  → recommendations from rule engine
  → No changes needed to read path — it already queries daily_logs + exercise_logs
```

## Step 1: Add FitTrack Tables to Coach Project

Copy FitTrack's schema into a new migration in the Coach project. Changes from original:
- Remove `public.profiles` (Coach already has its own profiles table with different schema)
- Keep `user_settings` (Coach doesn't have it)
- Keep `workouts`, `workout_exercises`, `workout_sets`, `routines`, `routine_items`, `workout_cardio`
- Modify the Coach's existing `handle_new_user()` trigger to also create `user_settings`
- All tables go into the `public` schema of the Coach's Supabase project (`pctsrnaevhjeahbnrjfm`)

## Step 2: Postgres Trigger — Auto-Summary

Create a function that fires when a workout is marked `status = 'completed'`:

### Function: `summarize_completed_workout()`
```sql
CREATE OR REPLACE FUNCTION public.summarize_completed_workout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_workout_date date;
  v_day_of_week text;
  v_total_sets int;
  v_completed_sets int;
  v_compound_rir numeric;
  v_isolation_rir numeric;
  v_strength_exercises int;
  v_exercise_log_id uuid;
BEGIN
  -- Only fire on completion
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    v_user_id := NEW.user_id;
    v_workout_date := NEW.workout_date;
    v_day_of_week := to_char(NEW.workout_date, 'Day');

    -- Calculate summary metrics from sets
    SELECT
      COUNT(ws.id),
      COUNT(ws.id) FILTER (WHERE ws.completed = true),
      ROUND(AVG(ws.rir) FILTER (WHERE ws.completed = true AND we.exercise_id IN (...compound...)), 1),
      ROUND(AVG(ws.rir) FILTER (WHERE ws.completed = true AND we.exercise_id IN (...isolation...)), 1)
    INTO v_total_sets, v_completed_sets, v_compound_rir, v_isolation_rir
    FROM workout_exercises we
    JOIN workout_sets ws ON ws.workout_exercise_id = we.id
    WHERE we.workout_id = NEW.id;

    -- Upsert daily_logs
    INSERT INTO daily_logs (user_id, log_date, day_of_week, training_done)
    VALUES (v_user_id, v_workout_date, trim(v_day_of_week), true)
    ON CONFLICT (user_id, log_date)
    DO UPDATE SET training_done = true, day_of_week = trim(v_day_of_week);

    -- For each exercise: insert into exercise_logs
    INSERT INTO exercise_logs (daily_log_id, exercise_name, sets_completed, target_sets, reps_completed, target_reps, weight_lb, rir)
    SELECT
      (SELECT id FROM daily_logs WHERE user_id = v_user_id AND log_date = v_workout_date LIMIT 1),
      we.exercise_name,
      (SELECT COUNT(*) FROM workout_sets ws2 WHERE ws2.workout_exercise_id = we.id AND ws2.completed = true),
      we.target_sets,
      (SELECT MAX(ws2.reps) FROM workout_sets ws2 WHERE ws2.workout_exercise_id = we.id AND ws2.completed = true),
      we.target_reps::text,
      (SELECT MAX(ws2.weight) FROM workout_sets ws2 WHERE ws2.workout_exercise_id = we.id AND ws2.completed = true),
      (SELECT ROUND(AVG(ws2.rir)) FROM workout_sets ws2 WHERE ws2.workout_exercise_id = we.id AND ws2.completed = true)
    FROM workout_exercises we
    WHERE we.workout_id = NEW.id
    AND we.item_type = 'strength';

    -- Update compound/isolation RIR on daily_logs
    UPDATE daily_logs
    SET compound_rir = v_compound_rir,
        isolation_rir = v_isolation_rir
    WHERE user_id = v_user_id AND log_date = v_workout_date;
  END IF;
  RETURN NEW;
END;
$$;
```

Defer exercise classification (compound vs isolation) to a mapping table or simple name matching list. Start with a hardcoded set of compound exercise IDs.

## Step 3: Repoint FitTrack to Coach's Supabase

### File changes in fitness-tracker-mobile:
1. `.env` → set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the Coach project's values
2. `src/services/cloud/supabase.ts` (if exists) or `src/auth.ts` → update client initialization
3. `supabase/functions/` — not used by FitTrack currently, but ensure config aligns

## Step 4: Handle Duplicate Auth

Because both apps share the same Supabase project:
- A user created in FitTrack is the same auth identity as in the Coach
- Auth token works in both apps
- `localStorage` persistence means signing into one logs you into the other
- Add a "This app uses your fitness-activity-coach account" note on FitTrack's login screen

## Step 5: Verification Queries

After migration is applied, verify with:
```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN
  ('workouts', 'workout_exercises', 'workout_sets', 'routines', 'routine_items', 'workout_cardio', 'user_settings');

-- Check trigger exists
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'workouts';
```

## Files to Create/Modify

### In fitness-activity-coach:
1. `supabase/migrations/004_merge_fittrack.sql` — adds FitTrack tables + trigger
2. `supabase/migrations/005_fix_user_trigger.sql` — modifies handle_new_user for user_settings

### In fitness-tracker-mobile (repoint to Coach project):
3. `.env` — set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (from Coach)
4. `src/services/cloud/supabase.ts` or equivalent — use Coach project
5. `src/components/AuthScreen.tsx` — note about shared account

## What Changes in Each App's UX

### FitTrack (workout logging)
- Same UI, same experience
- Connected to the Coach's Supabase project
- When a workout is completed, it triggers the Coach's evaluation rules

### Coach (dashboard + macros + evaluation)
- No changes needed to read behaviour
- `daily_logs.training_done` auto-populates when FitTrack completes a workout
- `compound_rir` / `isolation_rir` auto-fills from actual set data
- Exercise volume, RIR compliance rules now use real logged data
- The "Log Training" manual form becomes optional — FitTrack can do the heavy lifting

## Phasing

**Phase A (this build):**
1. Migration to add FitTrack tables
2. Trigger function for workout summary
3. Modify handle_new_user trigger
4. Update `user_settings` RLS policies to match Coach's pattern

**Phase B (after verification):**
5. Repoint FitTrack's .env to Coach project
6. Verify auth works cross-app
7. Run a test workout, verify daily_logs populated correctly
