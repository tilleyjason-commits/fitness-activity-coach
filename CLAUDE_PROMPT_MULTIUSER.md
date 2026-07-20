Read MULTIUSER_SPEC.md carefully. This is the build spec.

Also read these files to understand the current codebase:

Coach project reference files:
- src/App.tsx — route structure, AuthGuard
- src/lib/supabase.ts — supabase client
- src/lib/db.ts — existing DB functions (getProfile, upsertProfile, etc.)
- src/lib/types.ts — existing types
- src/context/AuthContext.tsx — auth provider
- src/pages/Settings.tsx — existing profile editing pattern
- src/components/PageHeader.tsx — page header component pattern
- supabase/migrations/002_new_rule_columns.sql — example migration format
- supabase/migrations/004_merge_fittrack.sql — example of RLS policies
- src/pages/Login.tsx — login page styling for consistency

Then BUILD the following. Verify with npm run build at the end.

## 1. Create `supabase/migrations/007_rls_core_tables.sql`

Enable RLS and add per-user policies (use `CREATE POLICY IF NOT EXISTS`) for:

- **daily_logs**
  - Policy: `FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())`
  - Name: "users manage own daily_logs"

- **exercise_logs**
  - Policy: `FOR ALL USING (EXISTS SELECT 1 FROM daily_logs WHERE daily_logs.id = exercise_logs.daily_log_id AND daily_logs.user_id = auth.uid())`
  - Name: "exercise_logs follow daily_log ownership"

- **recommendations**
  - Policy: `FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())`
  - Name: "users manage own recommendations"

- **weekly_summaries**
  - Policy: `FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())`
  - Name: "users manage own weekly summaries"

- **profiles**
  - Policy: `FOR ALL USING (id = auth.uid()::text::uuid OR user_id = auth.uid()) WITH CHECK (id = auth.uid()::text::uuid OR user_id = auth.uid())`
  - Name: "users manage own profile"

Add `ALTER TABLE tablename ENABLE ROW LEVEL SECURITY;` before each policy.

## 2. Modify `src/lib/types.ts`

Add the ProfileSetup interface (see spec). Place it near the existing Profile interface.

## 3. Modify `src/lib/db.ts`

Add the `hasProfile(userId: string): Promise<boolean>` function. It should count rows in profiles where id = userId. Return true if count > 0.

## 4. Create `src/pages/SetupWizard.tsx`

Multi-step wizard with 3 steps. Full implementation details:

### Layout
- Full-page centered layout, NO NavBar, NO AuthGuard wrapper
- Check auth internally — if no user, redirect to /login
- Styled identically to Login.tsx (dark background, centered card)

### Stepper UI
- 3 circles connected by lines at the top:
  - Step 1: "About You" — circle filled green if step >= 1
  - Step 2: "Stats" — circle filled green if step >= 2
  - Step 3: "Goals" — circle filled green if step >= 3
- Current step shows an outline, completed steps are solid green, future steps are grey

### Step 1 — About You
Fields: Age, Height (cm), Training Years (years, step 0.5), Training Time (select: Morning/Midday/Afternoon/Evening)
Validation: Age required and >= 10, Height required and > 100

### Step 2 — Current Stats  
Fields: Current Weight (lb, step 0.1), Body Fat % (0-60, step 0.1)
Validation: Weight required and > 50, Body fat required and between 0-60
Back button goes to step 1 preserving all data

### Step 3 — Goals
Fields: Goal Weight (lb), Goal Body Fat % (0-60)
Summary card showing all fields from all 3 steps
"Let's go!" button:
- Sets saving state, calls upsertProfile
- On success: Navigate to "/"
- On error: Show error message, still navigates to "/" (fail open so users aren't stuck)
- On submit: disabled + spinner

### State
- `step: 1 | 2 | 3` — current step
- `setupData: { age, height_cm, weight_lb, bodyfat_pct, goal_bodyfat_pct, goal_weight_lb, training_years, training_time }` — all fields preserved across steps
- Data persists when going back

### Error/Loading states:
- Loading: full-page spinner while checking auth
- Form validation errors on "Continue" click for each step
- Saving spinner on final submit
- Network error: show red message below form, still allow navigation to "/"

## 5. Modify `src/App.tsx`

Add the `/setup` route. It must be OUTSIDE the AuthGuard (no NavBar during setup) but still require authentication.

Two approaches:
a) Wrap it in its own guard that checks auth and shows loading
b) Add it at the same level as Login, not inside AuthGuard, and have SetupWizard check auth internally

Use approach (b): Add `<Route path="/setup" element={<SetupWizard />} />` next to the login route. The SetupWizard handles its own auth check internally.

## 6. Build Verification
Run `npm run build` — must pass with zero errors.

DO NOT:
- Edit any files other than the ones listed above
- Remove or modify any existing features
- Modify Login, Settings, Dashboard, or any other page
- Add any new dependencies
