import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Loader2, Star } from 'lucide-react';
import { useDailyLog } from '~/hooks/useDailyLog';
import { toHHMM } from '~/lib/evaluate';
import { MEAL_TIMING } from '~/lib/constants';
import type { DailyLog } from '~/lib/types';
import { PageHeader } from '~/components/PageHeader';
import { ToggleRow } from '~/components/ToggleRow';

const QUALITY_LABELS = ['Terrible', 'Poor', 'Okay', 'Good', 'Excellent'];

export default function LogSleep() {
  const navigate = useNavigate();
  const today = format(new Date(), 'yyyy-MM-dd');
  const { log, loading, saving, error, save } = useDailyLog(today);

  const [bedtime, setBedtime] = useState('');
  const [waketime, setWaketime] = useState('');
  const [quality, setQuality] = useState<number | null>(null);
  const [earlyWake, setEarlyWake] = useState(false);
  const [lastCaffeine, setLastCaffeine] = useState('');
  const [lastScreen, setLastScreen] = useState('');

  useEffect(() => {
    if (!log) return;
    setBedtime(toHHMM(log.bedtime) ?? '');
    setWaketime(toHHMM(log.waketime) ?? '');
    setQuality(log.sleep_quality);
    setEarlyWake(log.early_wake);
    setLastCaffeine(toHHMM(log.last_caffeine_time) ?? '');
    setLastScreen(toHHMM(log.last_screen_time) ?? '');
  }, [log]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const patch: Partial<DailyLog> = {
      bedtime: bedtime || null,
      waketime: waketime || null,
      sleep_quality: quality,
      early_wake: earlyWake,
      last_caffeine_time: lastCaffeine || null,
      last_screen_time: lastScreen || null,
      caffeine_cutoff_respected: lastCaffeine
        ? lastCaffeine <= MEAL_TIMING.caffeineCutoff
        : null,
    };
    const saved = await save(patch);
    if (saved) navigate('/');
  }

  return (
    <form onSubmit={handleSubmit}>
      <PageHeader title="Log Sleep" subtitle={format(new Date(), 'EEEE, MMMM d')} backTo="/log" />

      <section className="mb-4" aria-label="Sleep times">
        <h2 className="section-title">Times</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="bedtime" className="label">
              Bedtime
            </label>
            <input
              id="bedtime"
              type="time"
              value={bedtime}
              onChange={(e) => setBedtime(e.target.value)}
              className="field"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              target ~{MEAL_TIMING.bedtime}
            </p>
          </div>
          <div>
            <label htmlFor="waketime" className="label">
              Wake time
            </label>
            <input
              id="waketime"
              type="time"
              value={waketime}
              onChange={(e) => setWaketime(e.target.value)}
              className="field"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              target ~{MEAL_TIMING.waketime}
            </p>
          </div>
        </div>
      </section>

      <section className="card mb-4" aria-label="Sleep quality">
        <span className="label">Sleep quality</span>
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Sleep quality 1 to 5">
          {QUALITY_LABELS.map((qualityLabel, index) => {
            const step = index + 1;
            const filled = quality !== null && step <= quality;
            return (
              <button
                key={step}
                type="button"
                role="radio"
                aria-checked={quality === step}
                aria-label={`${step} of 5 â€” ${qualityLabel}`}
                onClick={() => setQuality(step)}
                className="rounded-lg p-1.5 transition-transform active:scale-90"
              >
                <Star
                  className={`h-8 w-8 ${
                    filled
                      ? 'fill-emerald-500 text-emerald-500'
                      : 'text-slate-300 dark:text-slate-600'
                  }`}
                />
              </button>
            );
          })}
          <span className="ml-2 text-sm text-slate-500 dark:text-slate-400">
            {quality !== null ? QUALITY_LABELS[quality - 1] : 'Tap to rate'}
          </span>
        </div>
      </section>

      <section className="mb-4 space-y-3" aria-label="Sleep hygiene">
        <h2 className="section-title">Hygiene</h2>
        <ToggleRow
          label="Woke early"
          description="Before the alarm, couldn't fall back asleep"
          checked={earlyWake}
          onChange={setEarlyWake}
        />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="last-caffeine" className="label">
              Last caffeine
            </label>
            <input
              id="last-caffeine"
              type="time"
              value={lastCaffeine}
              onChange={(e) => setLastCaffeine(e.target.value)}
              className="field"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              cutoff {MEAL_TIMING.caffeineCutoff}
            </p>
          </div>
          <div>
            <label htmlFor="last-screen" className="label">
              Last screen time
            </label>
            <input
              id="last-screen"
              type="time"
              value={lastScreen}
              onChange={(e) => setLastScreen(e.target.value)}
              className="field"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              screens off before bed
            </p>
          </div>
        </div>
      </section>

      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      <button type="submit" disabled={saving || loading} className="btn-primary">
        {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        Save sleep
      </button>
    </form>
  );
}
