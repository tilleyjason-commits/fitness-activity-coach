import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const smokeEmail = process.env.SMOKE_USER_EMAIL;
const smokePassword = process.env.SMOKE_USER_PASSWORD;
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const hasSmokeCredentials = Boolean(smokeEmail && smokePassword && supabaseUrl && supabaseAnonKey);

async function signInThroughUi(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('./#/login');
  await page.getByLabel('Email').fill(smokeEmail!);
  await page.getByLabel('Password').fill(smokePassword!);
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
