import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { CalendarDays, Loader2, Scale } from 'lucide-react';
import { useAuth } from '~/context/AuthContext';
import { useDailyLog } from '~/hooks/useDailyLog';
import { getProfile, getRecentWeighIns } from '~/lib/db';
import type { DailyLog, Profile } from '~/lib/types';
import { PageHeader } from '~/components/PageHeader';

function toStr(value: number | null): string {
  return value === null ? '' : String(value);
}

function toNum(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}

export default function LogWeight() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const today = format(new Date(), 'yyyy-MM-dd');
  const [date, setDate] = useState(today);
  const { log, loading, saving, error, save } = useDailyLog(date);

  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [previous, setPrevious] = useState<DailyLog | null>(null);

  const isSunday = format(parseISO(date), 'EEEE') === 'Sunday';

  useEffect(() => {
    if (!user) return;
    getProfile(user.id)
      .then(setProfile)
      .catch(() => setProfile(null));
    getRecentWeighIns(user.id, 2).then((rows) => {
      // Most recent weigh-in that isn't the currently edited date.
      const prior = [...rows].reverse().find((r) => r.log_date !== date) ?? null;
      setPrevious(prior);
    }).catch(() => setPrevious(null));
  }, [user, date]);

  useEffect(() => {
    if (!log) {
      setWeight('');
      setWaist('');
      return;
    }
    setWeight(toStr(log.weekly_weight_lb));
    setWaist(toStr(log.weekly_waist_inches));
  }, [log]);

  const weightValue = toNum(weight);
  const delta =
    weightValue !== null && previous?.weekly_weight_lb != null
      ? Math.round((weightValue - previous.weekly_weight_lb) * 10) / 10
      : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const patch: Partial<DailyLog> = {
      weekly_weight_lb: weightValue,
      weekly_waist_inches: toNum(waist),
    };
    const saved = await save(patch);
    if (saved) navigate('/');
  }

  return (
    <form onSubmit={handleSubmit}>
      <PageHeader title="Weekly Weigh-in" subtitle="Same scale, same time, before breakfast" backTo="/" />

      {!isSunday && (
        <div className="card mb-4 flex items-start gap-3 border-l-4 border-l-amber-500">
          <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden />
          <p className="text-sm text-slate-700 dark:text-slate-200">
            Weigh-ins are planned for <strong>Sunday mornings</strong>. You can still record one
            today, but weekly trends compare Sunday to Sunday.
          </p>
        </div>
      )}

      <div className="mb-4">
        <label htmlFor="date" className="label">
          Date
        </label>
        <input
          id="date"
          type="date"
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value)}
          className="field"
        />
      </div>

      <div className="card mb-4 space-y-4">
        <div>
          <label htmlFor="weight" className="label">
            Weight (lb)
          </label>
          <input
            id="weight"
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
          <label htmlFor="waist" className="label">
            Waist (inches)
          </label>
          <input
            id="waist"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.1"
            value={waist}
            onChange={(e) => setWaist(e.target.value)}
            placeholder="e.g. 36.5"
            className="field"
          />
        </div>
      </div>

      {(previous?.weekly_weight_lb != null || profile?.goal_weight_lb != null) && (
        <div className="card mb-4 flex items-center gap-3">
          <Scale className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden />
          <div className="text-sm text-slate-600 dark:text-slate-300">
            {previous?.weekly_weight_lb != null && (
              <p>
                Last weigh-in: <strong>{previous.weekly_weight_lb} lb</strong>
                {delta !== null && (
                  <span className={delta <= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                    {' '}
                    ({delta > 0 ? '+' : ''}
                    {delta} lb)
                  </span>
                )}
              </p>
            )}
            {profile?.goal_weight_lb != null && (
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Goal: {profile.goal_weight_lb} lb
              </p>
            )}
          </div>
        </div>
      )}

      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      <button type="submit" disabled={saving || loading} className="btn-primary">
        {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        Save weigh-in
      </button>
    </form>
  );
}
