# Multi-User Support + Onboarding Wizard — Build Spec

## Overview
Add proper Row Level Security to the Coach's core tables and build a multi-step setup wizard that new users see once after signing up.

## Scope
1. **Migration 007: RLS policies** — Enable RLS on remaining unprotected tables
2. **Onboarding wizard** — `/setup` page, 3 steps, one-time redirect after signup
3. **Profile completion check** — AuthGuard checks if profile has initial data

## Step 1: Migration — RLS on Core Tables

**File:** `supabase/migrations/007_rls_core_tables.sql`

Enable RLS + add per-user policies on:

- `daily_logs` — `FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())`
- `exercise_logs` — `FOR ALL USING (EXISTS SELECT 1 FROM daily_logs WHERE id = daily_log_id AND user_id = auth.uid())`
- `recommendations` — `FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())`
- `weekly_summaries` — `FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())`
- `profiles` — `FOR ALL USING (id = auth.uid() OR user_id = auth.uid()) WITH CHECK (id = auth.uid() OR user_id = auth.uid())`

Each policy should use `CREATE POLICY IF NOT EXISTS` pattern so it's idempotent.

## Step 2: Profile Completion Check

### `src/lib/db.ts` — add function:
```typescript
/**
 * Returns true when the profile has at least been started (has a row).
 * The wizard checks this to decide whether to redirect.
 */
export async function hasProfile(userId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('id', userId);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}
```

### `src/lib/types.ts` — add:
```typescript
export interface ProfileSetup {
  age: number | null;
  height_cm: number | null;
  weight_lb: number | null;
  bodyfat_pct: number | null;
  goal_bodyfat_pct: number | null;
  goal_weight_lb: number | null;
  training_years: number | null;
  training_time: string | null;
}
```

## Step 3: Onboarding Wizard — `/setup`

**File:** `src/pages/SetupWizard.tsx`

A 3-step multi-step wizard styled to match the Coach's dark theme. Each step has a stepper indicator at the top showing current progress.

### Step 1: About You
- Age (number input, 0-100)
- Height (number input, cm, step 0.1)
- Training experience (number input, years, step 0.5)
- "Sometimes I train at:" (select: Morning / Midday / Afternoon / Evening)
- Forward arrow button

### Step 2: Current Stats
- Current weight (number input, lb, step 0.1)
- Body fat % (number input, 0-60, step 0.1)
- Forward arrow button
- Back button

### Step 3: Goals
- Goal weight (number input, lb)
- Goal body fat % (number input, 0-60)
- Summary card showing all entered data
- "Let's go!" button

### State management:
- All wizard data collected in a single `SetupData` object in useState
- Step state (1 | 2 | 3) controls which fields render
- On step 3 submit:
  1. Call `upsertProfile()` to save all fields at once
  2. Navigate to `/` (dashboard)

### Stepper UI:
- 3 dots/circles at top: filled circle for completed steps, outline for current, grey for future
- Line connecting them
- Step label text below each: "About You", "Stats", "Goals"

### Styling:
- Full-page, no NavBar (the AuthGuard should NOT wrap it with NavBar)
- Centered card on mobile with max-w-sm
- Same emerald-500 primary accent as the rest of the app
- Field styles use `field` CSS class
- Button at bottom: "Continue" / "Back to step N" / "Let's go!"

## Step 4: AuthGuard Modification

The AuthGuard currently renders NavBar + Outlet for authenticated users.

**Add profile-check logic:**

```typescript
function AuthGuard() {
  const { user, loading } = useAuth();
  const [profileReady, setProfileReady] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return;
    // Check if profile exists (fresh signups get one from handle_new_user)
    // If the wizard hasn't been completed, the age field will be null
    getProfile(user.id)
      .then((p) => setProfileReady(p?.age !== null && p?.height_cm !== null))
      .catch(() => setProfileReady(true)); // fail open
  }, [user]);

  if (loading || profileReady === null) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!profileReady) return <Navigate to="/setup" replace />;

  return (
    <div className="mx-auto min-h-screen w-full max-w-md px-4 pb-28 pt-6">
      <Outlet />
      <NavBar />
    </div>
  );
}
```

## Step 5: Route Updates (`App.tsx`)

Add:
```tsx
<Route path="/setup" element={<SetupWizard />} />
```
This route must be OUTSIDE the AuthGuard (no NavBar during setup), but still behind authentication:
```tsx
<Route path="/setup" element={<NavigateSetup />} />
```
OR more simply: have SetupWizard also check auth internally and redirect if not logged in.

## Files to Create

NEW:
- `src/pages/SetupWizard.tsx` — multi-step onboarding (3 steps, ~250 lines)
- `supabase/migrations/007_rls_core_tables.sql` — RLS policies

MODIFIED:
- `src/App.tsx` — add `/setup` route outside AuthGuard (auth-wrapped but no NavBar)
- `src/lib/types.ts` — add `ProfileSetup` type
- `src/lib/db.ts` — add `hasProfile()` function

## Implementation Notes

- Do NOT modify any existing pages except App.tsx, types.ts, and db.ts
- Do NOT modify the Login page
- The setup wizard is a one-time flow — once profile has age + height, the redirect stops
- Profile upsert uses the existing `upsertProfile()` from db.ts
- All styling Tailwind, same design system as rest of app
- Back button on steps 2 and 3 should reset to previous step (preserving data)
- Step data should persist across step changes (use useState, not reset)
- Form validation: required fields show red border + "This field is required" on attempt to proceed
- Handle loading/saving/error states on final submit

## Future Considerations (do not implement)
- Ability to re-run wizard from Settings (not in scope)
- Multi-language support (not in scope)
