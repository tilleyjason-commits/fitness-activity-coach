import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, ChevronRight, Loader2, LogOut, Moon, Pill, UserRound } from 'lucide-react';
import { useAuth } from '~/context/AuthContext';
import { getProfile, upsertProfile } from '~/lib/db';
import {
  DEFAULT_REMINDER_PREFS,
  getNotificationPermission,
  getReminderPrefs,
  isNotificationSupported,
  requestReminderPermission,
  saveReminderPrefs,
  type ReminderCategory,
  type ReminderPrefs,
} from '~/lib/reminders';
import { applyTheme, getStoredTheme, type Theme } from '~/lib/theme';
import type { Profile } from '~/lib/types';
import { PageHeader } from '~/components/PageHeader';
import { ToggleRow } from '~/components/ToggleRow';

const REMINDER_CATEGORY_LABELS: Record<ReminderCategory, string> = {
  training: 'Training time',
  snack: 'Afternoon snack',
  caffeine: 'Caffeine cutoff',
  bedtime: 'Bedtime wind-down',
};

function toStr(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function toNum(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}

export default function Settings() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<Theme>(getStoredTheme());
  const [reminderPrefs, setReminderPrefs] = useState<ReminderPrefs>(DEFAULT_REMINDER_PREFS);
  const [reminderError, setReminderError] = useState<string | null>(null);

  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [bodyfat, setBodyfat] = useState('');
  const [goalWeight, setGoalWeight] = useState('');
  const [goalBodyfat, setGoalBodyfat] = useState('');
  const [trainingYears, setTrainingYears] = useState('');
  const [trainingTime, setTrainingTime] = useState('11:00');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    getProfile(user.id)
      .then((data) => {
        if (!active) return;
        setProfile(data);
        setAge(toStr(data?.age));
        setHeight(toStr(data?.height_cm));
        setWeight(toStr(data?.weight_lb));
        setBodyfat(toStr(data?.bodyfat_pct));
        setGoalWeight(toStr(data?.goal_weight_lb));
        setGoalBodyfat(toStr(data?.goal_bodyfat_pct));
        setTrainingYears(toStr(data?.training_years));
        setTrainingTime((data?.training_time ?? '11:00').slice(0, 5));
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load profile');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user]);

  // user.id (not the user object) — getReminderPrefs returns a freshly
  // parsed object once real prefs exist, so an object-identity dependency on
  // a `user` value that isn't reference-stable across renders would never
  // stop re-firing (see the equivalent fix in MacroTrackerPage.tsx).
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    setReminderPrefs(getReminderPrefs(userId));
  }, [userId]);

  async function handleReminderMasterToggle(nextEnabled: boolean) {
    if (!user) return;
    setReminderError(null);
    if (!nextEnabled) {
      const next = { ...reminderPrefs, enabled: false };
      setReminderPrefs(next);
      saveReminderPrefs(user.id, next);
      return;
    }
    if (!isNotificationSupported()) {
      setReminderError('This browser does not support notifications.');
      return;
    }
    const permission =
      getNotificationPermission() === 'granted'
        ? 'granted'
        : await requestReminderPermission();
    if (permission !== 'granted') {
      setReminderError('Notifications are blocked — allow them in your browser/device settings to enable reminders.');
      return;
    }
    const next = { ...reminderPrefs, enabled: true };
    setReminderPrefs(next);
    saveReminderPrefs(user.id, next);
  }

  function handleReminderCategoryToggle(category: ReminderCategory, checked: boolean) {
    if (!user) return;
    const next = { ...reminderPrefs, categories: { ...reminderPrefs.categories, [category]: checked } };
    setReminderPrefs(next);
    saveReminderPrefs(user.id, next);
  }

  function handleThemeChange(dark: boolean) {
    const next: Theme = dark ? 'dark' : 'light';
    setTheme(next);
    applyTheme(next);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const updated = await upsertProfile({
        id: user.id,
        user_id: user.id,
        age: toNum(age),
        height_cm: toNum(height),
        weight_lb: toNum(weight),
        bodyfat_pct: toNum(bodyfat),
        goal_bodyfat_pct: toNum(goalBodyfat),
        goal_weight_lb: toNum(goalWeight),
        training_years: toNum(trainingYears),
        training_time: trainingTime.trim() === '' ? null : trainingTime,
      });
      setProfile(updated);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  return (
    <div>
      <PageHeader title="More" />

      <section className="card mb-4" aria-label="Account">
        <div className="mb-1 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
            <UserRound className="h-5 w-5 text-emerald-500" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{user?.email ?? 'Signed in'}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {profile ? 'Profile loaded' : loading ? 'Loading…' : 'No profile yet'}
            </p>
          </div>
        </div>
      </section>

      <section className="mb-4" aria-label="Appearance">
        <h2 className="section-title">Appearance</h2>
        <ToggleRow
          label="Dark mode"
          description="Slate theme tuned for evening logging"
          checked={theme === 'dark'}
          onChange={handleThemeChange}
          icon={<Moon className="h-5 w-5" aria-hidden />}
        />
      </section>

      <section className="mb-4" aria-label="Reminders">
        <h2 className="section-title">Coach reminders</h2>
        <ToggleRow
          label="Reminders"
          description="Nudges for training, snacks, caffeine cutoff, and bedtime — only while the app is open"
          checked={reminderPrefs.enabled}
          onChange={(checked) => void handleReminderMasterToggle(checked)}
          icon={<Bell className="h-5 w-5" aria-hidden />}
        />
        {reminderError && <p className="mt-2 text-sm text-red-500">{reminderError}</p>}
        {reminderPrefs.enabled && (
          <div className="mt-2 space-y-2">
            {(Object.keys(REMINDER_CATEGORY_LABELS) as ReminderCategory[]).map((category) => (
              <ToggleRow
                key={category}
                label={REMINDER_CATEGORY_LABELS[category]}
                checked={reminderPrefs.categories[category]}
                onChange={(checked) => handleReminderCategoryToggle(category, checked)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mb-4" aria-label="Tools">
        <h2 className="section-title">Tools</h2>
        <Link to="/routines" className="card mb-2 flex w-full items-center gap-3">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Weekly routines</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              Preset workout templates
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
        </Link>
        <Link to="/settings/supplements" className="card flex w-full items-center gap-3">
          <span className="shrink-0 text-slate-400 dark:text-slate-500">
            <Pill className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Supplements</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              Manage your supplement list
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
        </Link>
      </section>

      <form onSubmit={handleSubmit} className="mb-4" aria-label="Profile editor">
        <h2 className="section-title">Profile</h2>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          Targets, meal timing, and coaching rules use these values.
        </p>
        <div className="card">
          <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="settings-age" className="label">
              Age
            </label>
            <input
              id="settings-age"
              type="number"
              min={0}
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="settings-height" className="label">
              Height (cm)
            </label>
            <input
              id="settings-height"
              type="number"
              min={0}
              step="0.1"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="settings-weight" className="label">
              Weight (lb)
            </label>
            <input
              id="settings-weight"
              type="number"
              min={0}
              step="0.1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="settings-bodyfat" className="label">
              Body fat (%)
            </label>
            <input
              id="settings-bodyfat"
              type="number"
              min={0}
              max={60}
              step="0.1"
              value={bodyfat}
              onChange={(e) => setBodyfat(e.target.value)}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="settings-goal-weight" className="label">
              Goal weight (lb)
            </label>
            <input
              id="settings-goal-weight"
              type="number"
              min={0}
              step="0.1"
              value={goalWeight}
              onChange={(e) => setGoalWeight(e.target.value)}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="settings-goal-bf" className="label">
              Goal body fat (%)
            </label>
            <input
              id="settings-goal-bf"
              type="number"
              min={0}
              max={60}
              step="0.1"
              value={goalBodyfat}
              onChange={(e) => setGoalBodyfat(e.target.value)}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="settings-years" className="label">
              Training years
            </label>
            <input
              id="settings-years"
              type="number"
              min={0}
              step="0.5"
              value={trainingYears}
              onChange={(e) => setTrainingYears(e.target.value)}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="settings-training-time" className="label">
              Training time
            </label>
            <input
              id="settings-training-time"
              type="time"
              value={trainingTime}
              onChange={(e) => setTrainingTime(e.target.value)}
              className="field"
            />
          </div>
          </div>
          {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
          {saved && !error && (
            <p className="mb-3 text-sm text-emerald-600 dark:text-emerald-400">Profile updated.</p>
          )}
          <button type="submit" disabled={saving || loading} className="btn-primary">
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Save profile
          </button>
        </div>
      </form>

      <button
        type="button"
        onClick={() => void handleSignOut()}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-300 py-3 text-base font-semibold text-red-600 transition-colors hover:bg-red-50 dark:border-red-500/40 dark:text-red-400 dark:hover:bg-red-500/10"
      >
        <LogOut className="h-4 w-4" aria-hidden />
        Log out
      </button>
    </div>
  );
}
