import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const smokeEmail = process.env.SMOKE_USER_EMAIL;
const smokePassword = process.env.SMOKE_USER_PASSWORD;
const smokeUserBEmail = process.env.SMOKE_USER_B_EMAIL;
const smokeUserBPassword = process.env.SMOKE_USER_B_PASSWORD;
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const hasSmokeCredentials = Boolean(smokeEmail && smokePassword && supabaseUrl && supabaseAnonKey);
const hasCatalogSmokeCredentials = Boolean(
  smokeUserBEmail && smokeUserBPassword && supabaseUrl && supabaseAnonKey,
);

async function signInThroughUi(
  page: import('@playwright/test').Page,
  email = smokeEmail!,
  password = smokePassword!,
): Promise<void> {
  await page.goto('./#/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('navigation')).toBeVisible();
}

test('signed-out visitors see login and protected routes redirect safely', async ({ page }) => {
  await page.goto('./#/training');
  await expect(page.getByRole('heading', { name: 'Fitness Activity Coach' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test.describe('authenticated disposable-account smoke', () => {
  test.skip(!hasSmokeCredentials, 'Authenticated smoke skipped: local/CI smoke credentials are absent.');

  test('login, primary navigation, reversible RLS write, settings, and logout', async ({ page }) => {
    test.setTimeout(90_000);
    let api: SupabaseClient | null = null;
    let dailyLogId: string | null = null;

    try {
      await signInThroughUi(page);

      await page.getByRole('link', { name: 'Training', exact: true }).click();
      await expect(page).toHaveURL(/#\/training/);
      await expect(page.getByRole('heading', { name: 'Training' })).toBeVisible();

      await page.goto('./#/routines');
      await expect(page.getByRole('heading', { name: 'Routines' })).toBeVisible();
      await page.getByRole('link', { name: 'History' }).click();
      await expect(page).toHaveURL(/#\/training\?tab=history/);
      await expect(page.getByRole('button', { name: 'History' })).toHaveAttribute('aria-pressed', 'true');

      api = createClient(supabaseUrl!, supabaseAnonKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: auth, error: authError } = await api.auth.signInWithPassword({
        email: smokeEmail!,
        password: smokePassword!,
      });
      expect(authError).toBeNull();
      expect(auth.user).not.toBeNull();

      const offset = Date.now() % 3000;
      const smokeDate = new Date(Date.UTC(2080, 0, 1 + offset)).toISOString().slice(0, 10);
      const { data: created, error: createError } = await api
        .from('daily_logs')
        .upsert(
          {
            user_id: auth.user!.id,
            log_date: smokeDate,
            day_of_week: 'Monday',
            energy_score: 3,
          },
          { onConflict: 'user_id,log_date' },
        )
        .select('id,user_id,log_date,energy_score')
        .single();
      expect(createError).toBeNull();
      dailyLogId = created?.id ?? null;
      expect(created?.user_id).toBe(auth.user!.id);
      expect(created?.energy_score).toBe(3);

      const { data: readBack, error: readError } = await api
        .from('daily_logs')
        .select('id,energy_score')
        .eq('id', dailyLogId!)
        .single();
      expect(readError).toBeNull();
      expect(readBack?.energy_score).toBe(3);

      await page.getByRole('link', { name: 'Settings' }).click();
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
      await page.getByRole('button', { name: 'Log out' }).click();
      await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    } finally {
      if (api && dailyLogId) {
        const { error } = await api.from('daily_logs').delete().eq('id', dailyLogId);
        expect(error).toBeNull();
        const { data: afterDelete, error: verifyDeleteError } = await api
          .from('daily_logs')
          .select('id')
          .eq('id', dailyLogId);
        expect(verifyDeleteError).toBeNull();
        expect(afterDelete).toEqual([]);
      }
      if (api) await api.auth.signOut();
    }
  });
});

test.describe('authenticated user-supplements smoke', () => {
  // Requires migration 013 (user_supplements, supplement_logs, set_supplement_taken)
  // on the target project, plus both disposable accounts for the RLS checks.
  test.skip(
    !hasSmokeCredentials || !hasCatalogSmokeCredentials,
    'Supplements smoke skipped: both disposable-account credential sets are required.',
  );

  test('manage list, RPC legacy bridge, two-user RLS isolation, reversible cleanup', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const apiA = createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const apiB = createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const customName = `Smoke Custom ${Date.now()}`;
    // Local date, matching the app's format(new Date(), 'yyyy-MM-dd').
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate(),
    ).padStart(2, '0')}`;

    let userAId: string | null = null;
    let creatineId: string | null = null;
    let creatineExistedBefore = false;
    let priorCreatineActive: boolean | null = null;
    let priorCreatinePresence = false;
    let dailyLogExistedBefore = false;
    let priorCreatineTaken: boolean | null = null;

    try {
      const { data: authA, error: authAError } = await apiA.auth.signInWithPassword({
        email: smokeEmail!,
        password: smokePassword!,
      });
      expect(authAError).toBeNull();
      userAId = authA.user!.id;

      // Baseline: remember whether canonical Creatine and today's daily log
      // pre-exist so cleanup can restore the exact prior state.
      const { data: existingCreatine, error: existingCreatineError } = await apiA
        .from('user_supplements')
        .select('id,active')
        .eq('user_id', userAId)
        .eq('slug', 'creatine')
        .maybeSingle();
      expect(existingCreatineError).toBeNull();
      creatineExistedBefore = existingCreatine !== null;
      priorCreatineActive = existingCreatine?.active ?? null;

      const { data: priorDailyLog, error: priorDailyLogError } = await apiA
        .from('daily_logs')
        .select('id,creatine_taken')
        .eq('user_id', userAId)
        .eq('log_date', today)
        .maybeSingle();
      expect(priorDailyLogError).toBeNull();
      dailyLogExistedBefore = priorDailyLog !== null;
      priorCreatineTaken = priorDailyLog?.creatine_taken ?? null;

      // Ensure an active canonical Creatine row without overwriting an existing
      // row's name, dose, or instructions. Snapshot its presence row too so the
      // finally block restores the disposable account exactly.
      if (existingCreatine) {
        creatineId = existingCreatine.id;
        const { data: priorPresence, error: priorPresenceError } = await apiA
          .from('supplement_logs')
          .select('id')
          .eq('supplement_id', creatineId)
          .eq('log_date', today);
        expect(priorPresenceError).toBeNull();
        priorCreatinePresence = (priorPresence ?? []).length > 0;
        if (!existingCreatine.active) {
          const { error: activateError } = await apiA
            .from('user_supplements')
            .update({ active: true })
            .eq('id', creatineId);
          expect(activateError).toBeNull();
        }
      } else {
        const { data: creatineRow, error: creatineInsertError } = await apiA
          .from('user_supplements')
          .insert({ user_id: userAId, slug: 'creatine', name: 'Creatine', active: true })
          .select('id')
          .single();
        expect(creatineInsertError).toBeNull();
        creatineId = creatineRow!.id;
      }

      // Deterministic start: no presence row for today.
      const { error: precleanError } = await apiA
        .from('supplement_logs')
        .delete()
        .eq('supplement_id', creatineId!)
        .eq('log_date', today);
      expect(precleanError).toBeNull();

      // --- UI as user A: quick action → toggle Creatine on, verify persistence.
      await signInThroughUi(page);
      await page.getByRole('link', { name: 'Log Supplements' }).click();
      await expect(page).toHaveURL(/#\/log\/supplements/);

      const creatineSwitch = page.getByRole('switch', { name: 'Creatine' });
      await expect(creatineSwitch).toHaveAttribute('aria-checked', 'false');
      await creatineSwitch.click();
      await expect(page.getByRole('status')).toHaveText('Saved', { timeout: 15_000 });
      await page.reload();
      await expect(page.getByRole('switch', { name: 'Creatine' })).toHaveAttribute(
        'aria-checked',
        'true',
      );

      // RPC bridge: the presence row and the legacy boolean flipped together.
      const { data: presenceOn, error: presenceOnError } = await apiA
        .from('supplement_logs')
        .select('id')
        .eq('supplement_id', creatineId!)
        .eq('log_date', today);
      expect(presenceOnError).toBeNull();
      expect(presenceOn).toHaveLength(1);
      const { data: logOn, error: logOnError } = await apiA
        .from('daily_logs')
        .select('creatine_taken')
        .eq('user_id', userAId)
        .eq('log_date', today)
        .single();
      expect(logOnError).toBeNull();
      expect(logOn?.creatine_taken).toBe(true);

      // --- UI: add a custom supplement, deactivate, reactivate.
      await page.getByRole('link', { name: 'Manage supplements' }).click();
      await expect(page).toHaveURL(/#\/settings\/supplements/);
      await page.getByRole('button', { name: 'Add custom supplement' }).click();
      await page.getByLabel('Name').fill(customName);
      await page.getByRole('button', { name: 'Save', exact: true }).click();

      const customSwitch = page.getByRole('switch', { name: `${customName} active` });
      await expect(customSwitch).toHaveAttribute('aria-checked', 'true');
      await customSwitch.click();
      const inactiveSection = page.getByRole('region', { name: 'Inactive' });
      await expect(
        inactiveSection.getByRole('switch', { name: `${customName} active` }),
      ).toHaveAttribute('aria-checked', 'false');
      await inactiveSection.getByRole('switch', { name: `${customName} active` }).click();
      await expect(
        page
          .getByRole('region', { name: 'Active supplements' })
          .getByRole('switch', { name: `${customName} active` }),
      ).toHaveAttribute('aria-checked', 'true');

      // --- Two-user isolation, API as user B.
      const { data: authB, error: authBError } = await apiB.auth.signInWithPassword({
        email: smokeUserBEmail!,
        password: smokeUserBPassword!,
      });
      expect(authBError).toBeNull();

      const { data: bVisibleRows, error: bReadError } = await apiB
        .from('user_supplements')
        .select('id,user_id');
      expect(bReadError).toBeNull();
      expect((bVisibleRows ?? []).filter((r) => r.user_id === userAId)).toEqual([]);
      expect((bVisibleRows ?? []).filter((r) => r.id === creatineId)).toEqual([]);

      // Cross-user reference: rejected even with B's own user_id on the row.
      const { error: bInsertError } = await apiB.from('supplement_logs').insert({
        user_id: authB.user!.id,
        supplement_id: creatineId!,
        log_date: today,
      });
      expect(bInsertError).not.toBeNull();

      const { error: bRpcError } = await apiB.rpc('set_supplement_taken', {
        p_supplement_id: creatineId!,
        p_log_date: today,
        p_taken: true,
      });
      expect(bRpcError).not.toBeNull();

      // --- Reversible: toggle Creatine back off through the UI.
      await page.goto('./#/log/supplements');
      await page.getByRole('switch', { name: 'Creatine' }).click();
      await expect(page.getByRole('status')).toHaveText('Saved', { timeout: 15_000 });
      const { data: presenceOff, error: presenceOffError } = await apiA
        .from('supplement_logs')
        .select('id')
        .eq('supplement_id', creatineId!)
        .eq('log_date', today);
      expect(presenceOffError).toBeNull();
      expect(presenceOff).toEqual([]);
      const { data: logOff, error: logOffError } = await apiA
        .from('daily_logs')
        .select('creatine_taken')
        .eq('user_id', userAId)
        .eq('log_date', today)
        .single();
      expect(logOffError).toBeNull();
      expect(logOff?.creatine_taken).toBe(false);
    } finally {
      if (userAId) {
        // Remove the custom row and, if this test created it, the Creatine row
        // (cascade removes any supplement_logs). Verify absence.
        const cleanupError1 = (
          await apiA.from('user_supplements').delete().eq('user_id', userAId).eq('name', customName)
        ).error;
        expect(cleanupError1).toBeNull();
        if (!creatineExistedBefore && creatineId) {
          const cleanupError2 = (
            await apiA.from('user_supplements').delete().eq('id', creatineId)
          ).error;
          expect(cleanupError2).toBeNull();
        } else if (creatineId) {
          const { error: activeRestoreError } = await apiA
            .from('user_supplements')
            .update({ active: priorCreatineActive })
            .eq('id', creatineId);
          expect(activeRestoreError).toBeNull();

          if (priorCreatinePresence) {
            const { error: presenceRestoreError } = await apiA
              .from('supplement_logs')
              .upsert(
                { user_id: userAId, supplement_id: creatineId, log_date: today },
                { onConflict: 'supplement_id,log_date' },
              );
            expect(presenceRestoreError).toBeNull();
          } else {
            const { error: presenceCleanupError } = await apiA
              .from('supplement_logs')
              .delete()
              .eq('supplement_id', creatineId)
              .eq('log_date', today);
            expect(presenceCleanupError).toBeNull();
          }
        }
        const { data: leftovers, error: leftoversError } = await apiA
          .from('user_supplements')
          .select('id,name,slug')
          .eq('user_id', userAId)
          .or(`name.eq.${customName}${creatineExistedBefore ? '' : ',slug.eq.creatine'}`);
        expect(leftoversError).toBeNull();
        expect(leftovers).toEqual([]);

        // Restore today's daily log to its prior state.
        if (!dailyLogExistedBefore) {
          const { error: dailyCleanupError } = await apiA
            .from('daily_logs')
            .delete()
            .eq('user_id', userAId)
            .eq('log_date', today);
          expect(dailyCleanupError).toBeNull();
        } else if (priorCreatineTaken !== null) {
          const { error: restoreError } = await apiA
            .from('daily_logs')
            .update({ creatine_taken: priorCreatineTaken })
            .eq('user_id', userAId)
            .eq('log_date', today);
          expect(restoreError).toBeNull();
        }
      }
      await apiA.auth.signOut();
      await apiB.auth.signOut();
    }
  });
});

test.describe('authenticated commercial-gym catalog smoke', () => {
  test.skip(
    !hasCatalogSmokeCredentials,
    'Catalog smoke skipped: second disposable-account credentials are absent.',
  );

  test('adds free-weight exercises in Training and Routines, then cleans up', async ({ page }) => {
    test.setTimeout(90_000);
    const api = createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    try {
      const { data: auth, error: authError } = await api.auth.signInWithPassword({
        email: smokeUserBEmail!,
        password: smokeUserBPassword!,
      });
      expect(authError).toBeNull();
      expect(auth.user).not.toBeNull();

      const { error: precleanError } = await api
        .from('workouts')
        .delete()
        .eq('user_id', auth.user!.id)
        .eq('status', 'active');
      expect(precleanError).toBeNull();

      await signInThroughUi(page, smokeUserBEmail!, smokeUserBPassword!);
      await page.goto('./#/training');
      await expect(page.getByRole('heading', { name: 'Training' })).toBeVisible();

      await page.getByRole('button', { name: 'Start Blank Workout' }).click();

      const trainingSelector = page.getByRole('region', { name: 'Add Exercise' });
      await trainingSelector.getByLabel('Search exercises').fill('barbell back squat');
      await trainingSelector.getByLabel('Equipment').selectOption('Barbell');
      await trainingSelector
        .getByRole('button', { name: /^Barbell Back Squat Barbell · Legs$/i })
        .click();
      await trainingSelector.getByRole('button', { name: 'Add to Workout' }).click();
      await expect(page.getByRole('button', { name: 'Remove Barbell Back Squat' })).toBeVisible();
      await expect(page.getByRole('status')).toHaveText('Saved', { timeout: 15_000 });

      const { data: activeWorkout, error: workoutError } = await api
        .from('workouts')
        .select('id')
        .eq('user_id', auth.user!.id)
        .eq('status', 'active')
        .single();
      expect(workoutError).toBeNull();
      const { data: savedExercise, error: exerciseError } = await api
        .from('workout_exercises')
        .select('exercise_id,exercise_name,muscle_group')
        .eq('workout_id', activeWorkout!.id)
        .eq('exercise_id', 'barbell-back-squat')
        .single();
      expect(exerciseError).toBeNull();
      expect(savedExercise).toEqual({
        exercise_id: 'barbell-back-squat',
        exercise_name: 'Barbell Back Squat',
        muscle_group: 'Legs',
      });

      await page.goto('./#/routines');
      await expect(page.getByRole('heading', { name: 'Routines' })).toBeVisible();
      const routineSelector = page.getByRole('region', { name: /^Add to / });
      await routineSelector.getByLabel('Search exercises').fill('dumbbell bench press');
      await routineSelector.getByLabel('Equipment').selectOption('Dumbbell');
      await routineSelector
        .getByRole('button', { name: /^Dumbbell Bench Press Dumbbell · Chest$/i })
        .click();
      await routineSelector.getByRole('button', { name: 'Add to Routine' }).click();
      await expect(page.getByRole('button', { name: 'Remove Dumbbell Bench Press' })).toBeVisible();
    } finally {
      const { data: session } = await api.auth.getUser();
      if (session.user) {
        const { error: cleanupError } = await api
          .from('workouts')
          .delete()
          .eq('user_id', session.user.id)
          .eq('status', 'active');
        expect(cleanupError).toBeNull();
        const { data: activeAfterCleanup, error: verifyCleanupError } = await api
          .from('workouts')
          .select('id')
          .eq('user_id', session.user.id)
          .eq('status', 'active');
        expect(verifyCleanupError).toBeNull();
        expect(activeAfterCleanup).toEqual([]);
      }
      await api.auth.signOut();
    }
  });
});
