import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, LogOut, Moon, UserRound } from 'lucide-react';
import { useAuth } from '~/context/AuthContext';
import { getProfile, upsertProfile } from '~/lib/db';
import { applyTheme, getStoredTheme, type Theme } from '~/lib/theme';
import type { Profile } from '~/lib/types';
import { PageHeader } from '~/components/PageHeader';
import { ToggleRow } from '~/components/ToggleRow';

function toStr(value: number | null): string {
  return value === null ? '' : String(value);
}

function toNum(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}

interface InfoRow {
  label: string;
  value: string;
}

function profileRows(profile: Profile | null): InfoRow[] {
  const dash = '—';
  return [
    { label: 'Age', value: profile?.age !== null && profile ? `${profile.age}` : dash },
    {
      label: 'Height',
      value: profile?.height_cm != null ? `${profile.height_cm} cm` : dash,
    },
    {
      label: 'Training experience',
      value: profile?.training_years != null ? `${profile.training_years} yr` : dash,
    },
    {
      label: 'Training time',
      value: profile?.training_time != null ? profile.training_time.slice(0, 5) : dash,
    },
    {
      label: 'Goal weight',
      value: profile?.goal_weight_lb != null ? `${profile.goal_weight_lb} lb` : dash,
    },
    {
      label: 'Goal body fat',
      value: profile?.goal_bodyfat_pct != null ? `${profile.goal_bodyfat_pct}%` : dash,
    },
  ];
}

export default function Settings() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<Theme>(getStoredTheme());

  const [weight, setWeight] = useState('');
  const [bodyfat, setBodyfat] = useState('');
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
        setWeight(toStr(data?.weight_lb ?? null));
        setBodyfat(toStr(data?.bodyfat_pct ?? null));
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
        age: profile?.age ?? null,
        height_cm: profile?.height_cm ?? null,
        weight_lb: toNum(weight),
        bodyfat_pct: toNum(bodyfat),
        goal_bodyfat_pct: profile?.goal_bodyfat_pct ?? null,
        goal_weight_lb: profile?.goal_weight_lb ?? null,
        training_years: profile?.training_years ?? null,
        training_time: profile?.training_time ?? null,
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
      <PageHeader title="Settings" backTo="/" />

      <section className="card mb-4" aria-label="Profile">
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
            <UserRound className="h-5 w-5 text-emerald-500" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{user?.email ?? 'Signed in'}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Profile</p>
          </div>
        </div>
        {loading ? (
          <p className="animate-pulse text-sm text-slate-500 dark:text-slate-400">
            Loading profile…
          </p>
        ) : (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            {profileRows(profile).map((row) => (
              <div key={row.label}>
                <dt className="text-xs text-slate-500 dark:text-slate-400">{row.label}</dt>
                <dd className="text-sm font-medium">{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
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

      <form onSubmit={handleSubmit} className="mb-4" aria-label="Body stats">
        <h2 className="section-title">Body stats</h2>
        <div className="card mb-3 space-y-4">
          <div>
            <label htmlFor="settings-weight" className="label">
              Current weight (lb)
            </label>
            <input
              id="settings-weight"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="e.g. 212.4"
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
              inputMode="decimal"
              min={0}
              max={60}
              step="0.1"
              value={bodyfat}
              onChange={(e) => setBodyfat(e.target.value)}
              placeholder="e.g. 24.5"
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
