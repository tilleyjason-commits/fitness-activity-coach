import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { CheckCircle2, Dumbbell, Moon, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import { useAuth } from '~/context/AuthContext';
import { useDailyLog } from '~/hooks/useDailyLog';
import { dismissRecommendation, getProfile, getRecentWeighIns, syncRecommendations } from '~/lib/db';
import { EMPTY_WEEKLY, evaluateDay, getRuleById } from '~/lib/evaluate';
import { TARGETS } from '~/lib/constants';
import { SEVERITY_ORDER, type DailyLog, type Profile, type Recommendation } from '~/lib/types';
import { StatusDot, type DotStatus } from '~/components/StatusDot';
import { RecommendationCard } from '~/components/RecommendationCard';

const WeightSparkline = lazy(() => import('~/components/WeightSparkline'));

interface ComplianceItem {
  label: string;
  status: DotStatus;
}

/** Green = done/passed, red = logged but failing, gray = not logged yet. */
function complianceItems(log: DailyLog | null): ComplianceItem[] {
  if (!log) {
    return ['Train', 'Protein', 'Casein', 'Snack', 'Sleep', 'Creatine'].map((label) => ({
      label,
      status: 'pending' as const,
    }));
  }
  return [
    { label: 'Train', status: log.training_done ? 'pass' : 'pending' },
    {
      label: 'Protein',
      status:
        log.daily_protein_g === null
          ? 'pending'
          : log.daily_protein_g >= TARGETS.proteinMinG
            ? 'pass'
            : 'fail',
    },
    { label: 'Casein', status: log.casein_taken ? 'pass' : 'pending' },
    { label: 'Snack', status: log.snack_3pm_logged ? 'pass' : 'pending' },
    {
      label: 'Sleep',
      status: log.sleep_quality === null ? 'pending' : log.sleep_quality >= 3 ? 'pass' : 'fail',
    },
    { label: 'Creatine', status: log.creatine_taken ? 'pass' : 'pending' },
  ];
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

interface QuickAction {
  to: string;
  label: string;
  icon: LucideIcon;
}

const QUICK_ACTIONS: QuickAction[] = [
  { to: '/log/training', label: 'Training', icon: Dumbbell },
  { to: '/log/nutrition', label: 'Nutrition', icon: UtensilsCrossed },
  { to: '/log/sleep', label: 'Sleep', icon: Moon },
];

export default function Dashboard() {
  const { user } = useAuth();
  const today = format(new Date(), 'yyyy-MM-dd');
  const { log, loading } = useDailyLog(today);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [weighIns, setWeighIns] = useState<DailyLog[]>([]);

  useEffect(() => {
    if (!user) return;
    getProfile(user.id)
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setProfileLoaded(true));
    getRecentWeighIns(user.id, 8)
      .then(setWeighIns)
      .catch(() => setWeighIns([]));
  }, [user]);

  // Re-evaluate the rules and reconcile the recommendations table whenever
  // today's log changes (profile supplies training_time for timing rules).
  useEffect(() => {
    if (!user || loading || !profileLoaded) return;
    if (!log) {
      setRecs([]);
      return;
    }
    const results = evaluateDay(log, EMPTY_WEEKLY, profile);
    syncRecommendations(user.id, today, results).then(setRecs).catch(console.error);
  }, [user, log, loading, profile, profileLoaded, today]);

  const sortedRecs = useMemo(
    () => [...recs].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]),
    [recs],
  );

  const sparkData = useMemo(
    () =>
      weighIns
        .filter((l) => l.weekly_weight_lb !== null)
        .map((l) => ({
          date: format(new Date(`${l.log_date}T00:00:00`), 'M/d'),
          weight: l.weekly_weight_lb as number,
        })),
    [weighIns],
  );

  async function handleDismiss(id: string) {
    setRecs((current) => current.filter((r) => r.id !== id));
    try {
      await dismissRecommendation(id);
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div>
      <header className="mb-5">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {format(new Date(), 'EEEE, MMMM d')}
        </p>
        <h1 className="text-2xl font-bold">{greeting()}</h1>
      </header>

      <section className="card mb-4" aria-label="Today's compliance">
        <h2 className="section-title">Today</h2>
        <div className="flex items-start justify-between">
          {complianceItems(log).map((item) => (
            <StatusDot key={item.label} status={item.status} label={item.label} />
          ))}
        </div>
      </section>

      <section className="mb-4" aria-label="Quick actions">
        <div className="grid grid-cols-3 gap-3">
          {QUICK_ACTIONS.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="card flex flex-col items-center gap-2 py-4 transition-colors hover:border-emerald-500/50"
            >
              <Icon className="h-6 w-6 text-emerald-500" aria-hidden />
              <span className="text-xs font-semibold">Log {label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mb-4" aria-label="Recommendations">
        <h2 className="section-title">Recommendations</h2>
        {loading ? (
          <div className="card animate-pulse text-sm text-slate-500 dark:text-slate-400">
            Evaluating today&apos;s rules…
          </div>
        ) : sortedRecs.length === 0 ? (
          <div className="card flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" aria-hidden />
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {log
                ? 'All clear — nothing needs attention right now.'
                : 'Nothing logged today yet. Start with training, nutrition, or sleep.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedRecs.map((rec) => (
              <RecommendationCard
                key={rec.id}
                severity={rec.severity}
                message={rec.message}
                domain={getRuleById(rec.rule_id)?.domain}
                onDismiss={() => void handleDismiss(rec.id)}
              />
            ))}
          </div>
        )}
      </section>

      {sparkData.length >= 2 && (
        <Suspense
          fallback={(
            <section className="card animate-pulse" aria-label="Weight trend">
              <h2 className="section-title mb-0">Weight trend</h2>
            </section>
          )}
        >
          <WeightSparkline data={sparkData} />
        </Suspense>
      )}
    </div>
  );
}
