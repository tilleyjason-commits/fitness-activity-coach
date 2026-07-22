import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import {
  CheckCircle2,
  Dumbbell,
  Moon,
  Pill,
  Play,
  Scale,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '~/context/AuthContext';
import { useDailyLog } from '~/hooks/useDailyLog';
import { useSupplements } from '~/hooks/useSupplements';
import {
  dismissRecommendation,
  getProfile,
  getRecentWeighIns,
  reconcileInapplicableRecommendations,
  syncRecommendations,
} from '~/lib/db';
import { getActiveWorkout, getWeeklyRoutines, hasCompletedWorkout } from '~/lib/workout-repo';
import { getTodayWeekday, getWorkoutTotals, routineHasItems } from '~/lib/workout-mappers';
import { EMPTY_WEEKLY, evaluateDay, getRuleById } from '~/lib/evaluate';
import {
  activeSlugSet,
  inapplicableSupplementRuleIds,
  isCanonicalActive,
  isSupplementRuleApplicable,
} from '~/lib/supplements';
import { resolveTargets } from '~/lib/constants';
import {
  SEVERITY_ORDER,
  type DailyLog,
  type DailyRoutine,
  type Profile,
  type Recommendation,
  type WorkoutState,
} from '~/lib/types';
import { StatusDot, type DotStatus } from '~/components/StatusDot';
import { RecommendationCard } from '~/components/RecommendationCard';

const WeightSparkline = lazy(() => import('~/components/WeightSparkline'));

interface ComplianceItem {
  label: string;
  status: DotStatus;
  /** Each glanceable status is also the shortcut to its logging surface. */
  to: string;
}

/**
 * Check = done/passed, × = logged but failing, ring = not logged yet.
 * Labels are protocol-neutral (PM Protein, not a specific product). Creatine
 * appears only while the user has an active canonical creatine supplement
 * (or as a legacy fallback when the list cannot load).
 */
function complianceItems(
  log: DailyLog | null,
  includeCreatine: boolean,
  proteinMinG: number,
): ComplianceItem[] {
  const items: ComplianceItem[] = [
    { label: 'Train', to: '/training', status: log?.training_done ? 'pass' : 'pending' },
    {
      label: 'Protein',
      to: '/macros',
      status:
        log == null || log.daily_protein_g === null
          ? 'pending'
          : log.daily_protein_g >= proteinMinG
            ? 'pass'
            : 'fail',
    },
    { label: 'PM Protein', to: '/log/nutrition', status: log?.casein_taken ? 'pass' : 'pending' },
    { label: 'Snack', to: '/macros', status: log?.snack_3pm_logged ? 'pass' : 'pending' },
    {
      label: 'Sleep',
      to: '/log/sleep',
      status:
        log == null || log.sleep_quality === null
          ? 'pending'
          : log.sleep_quality >= 3
            ? 'pass'
            : 'fail',
    },
  ];
  if (includeCreatine) {
    items.push({
      label: 'Creatine',
      to: '/log/supplements',
      status: log?.creatine_taken ? 'pass' : 'pending',
    });
  }
  return items;
}

function greeting(firstName: string | null): string {
  const hour = new Date().getHours();
  const base = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return firstName ? `${base}, ${firstName}` : base;
}

/** First name from auth metadata; never guessed from the email address. */
function resolveFirstName(user: { user_metadata?: Record<string, unknown> } | null): string | null {
  const meta = user?.user_metadata;
  const raw = meta?.first_name ?? meta?.full_name ?? meta?.name;
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  return raw.trim().split(/\s+/)[0];
}

type TodayWorkout =
  | { kind: 'loading' }
  | { kind: 'active'; workout: WorkoutState; routineName: string | null }
  | { kind: 'completed' }
  | { kind: 'routine'; routine: DailyRoutine }
  | { kind: 'none' };

/** One coach sentence from real training state — no invented metrics. */
function coachLine(today: TodayWorkout): string | null {
  if (today.kind === 'active') {
    const totals = getWorkoutTotals(today.workout);
    return `Workout in progress — ${totals.completedSets}/${totals.totalSets} sets done.`;
  }
  if (today.kind === 'completed') return 'Training is done — recovery is the job now.';
  if (today.kind === 'routine') {
    const name = today.routine.name.trim() || `${today.routine.day}'s routine`;
    return `${name} is on the plan today.`;
  }
  return null;
}

/**
 * One glance answers "what's today's session?" — routine preset, in-flight
 * progress, or done. Failure to load degrades to the generic start card.
 */
function TodayWorkoutCard({ today }: { today: TodayWorkout }) {
  if (today.kind === 'loading') {
    return (
      <section className="card mb-4 animate-pulse" aria-label="Today's workout">
        <h2 className="section-title mb-0">Today&apos;s workout</h2>
      </section>
    );
  }

  let body: { title: string; detail: string | null; cta: string };
  if (today.kind === 'active') {
    const totals = getWorkoutTotals(today.workout);
    body = {
      title: today.routineName ?? 'Workout in progress',
      detail: `${totals.completedSets}/${totals.totalSets} sets done${
        totals.totalCardioMinutes > 0 ? ` · ${totals.totalCardioMinutes} min cardio` : ''
      }`,
      cta: 'Resume',
    };
  } else if (today.kind === 'completed') {
    body = { title: 'Workout completed', detail: 'Nice work — see it in History.', cta: 'Open Workout' };
  } else if (today.kind === 'routine') {
    const count = today.routine.exercises.length + today.routine.cardioExercises.length;
    body = {
      title: today.routine.name.trim() || `${today.routine.day} routine`,
      detail: `${count} exercise${count === 1 ? '' : 's'} queued`,
      cta: 'Start',
    };
  } else {
    body = { title: 'No routine for today', detail: 'Start blank or plan the week.', cta: 'Open Workout' };
  }

  return (
    <section className="card mb-4" aria-label="Today's workout">
      <h2 className="section-title">Today&apos;s workout</h2>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {today.kind === 'completed' ? (
            <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" aria-hidden />
          ) : (
            <Dumbbell className="h-6 w-6 shrink-0 text-emerald-500" aria-hidden />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{body.title}</p>
            {body.detail && (
              <p className="text-xs text-slate-500 dark:text-slate-400">{body.detail}</p>
            )}
          </div>
        </div>
        <Link
          to="/training"
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
        >
          <Play className="h-4 w-4" aria-hidden />
          {body.cta}
        </Link>
      </div>
    </section>
  );
}

interface QuickAction {
  to: string;
  label: string;
  icon: LucideIcon;
}

const QUICK_ACTIONS: QuickAction[] = [
  { to: '/macros', label: 'Meal', icon: UtensilsCrossed },
  { to: '/log/sleep', label: 'Sleep', icon: Moon },
  { to: '/log/supplements', label: 'Supplements', icon: Pill },
  { to: '/log/weight', label: 'Weight', icon: Scale },
];

export default function Dashboard() {
  const { user } = useAuth();
  const today = format(new Date(), 'yyyy-MM-dd');
  const { log, loading } = useDailyLog(today);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [weighIns, setWeighIns] = useState<DailyLog[]>([]);
  const [todayWorkout, setTodayWorkout] = useState<TodayWorkout>({ kind: 'loading' });
  const {
    supplements,
    loading: supplementsLoading,
    error: supplementsError,
  } = useSupplements();

  // Legacy fallback: if the list cannot load (e.g. migration 013 not applied
  // yet), keep the pre-013 behavior of always showing Creatine. While loading,
  // omit only the Creatine dot so the rest of the row renders without flicker.
  const targets = resolveTargets(profile);
  const showCreatine = supplementsError
    ? true
    : !supplementsLoading && isCanonicalActive(supplements, 'creatine');

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

  // Today's Workout card state, from the same repository the Workout tab uses.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const userId = user.id;

    async function loadTodayWorkout() {
      try {
        const [active, routines, completed] = await Promise.all([
          getActiveWorkout(userId, today),
          getWeeklyRoutines(userId),
          hasCompletedWorkout(userId, today),
        ]);
        if (cancelled) return;
        const routine = routines[getTodayWeekday()];
        const routinePreset = routine && routineHasItems(routine) ? routine : null;
        if (active) {
          setTodayWorkout({
            kind: 'active',
            workout: active,
            routineName: routinePreset?.name.trim() || null,
          });
        } else if (completed) {
          setTodayWorkout({ kind: 'completed' });
        } else if (routinePreset) {
          setTodayWorkout({ kind: 'routine', routine: routinePreset });
        } else {
          setTodayWorkout({ kind: 'none' });
        }
      } catch {
        // Degrade to the generic card — Home must render offline.
        if (!cancelled) setTodayWorkout({ kind: 'none' });
      }
    }

    void loadTodayWorkout();
    return () => {
      cancelled = true;
    };
  }, [user, today]);

  // Re-evaluate the rules and reconcile the recommendations table whenever
  // today's log changes (profile supplies training_time for timing rules).
  // Waits for the supplement list so built-in supplement rules sync only when
  // their canonical slug is active; rules for deactivated supplements are
  // reconciled away instead. If the list fails to load, fall back to syncing
  // everything (pre-013 behavior).
  useEffect(() => {
    if (!user || loading || !profileLoaded || supplementsLoading) return;
    if (!log) {
      setRecs([]);
      return;
    }

    let cancelled = false;
    const userId = user.id;
    const results = evaluateDay(log, EMPTY_WEEKLY, profile);

    async function refreshRecommendations() {
      try {
        let next: Recommendation[];
        if (supplementsError) {
          next = await syncRecommendations(userId, today, results);
        } else {
          const activeSlugs = activeSlugSet(supplements);
          const applicable = results.filter((result) =>
            isSupplementRuleApplicable(result.rule.id, activeSlugs),
          );
          // Derive this from the complete canonical map rather than today's
          // evaluated results. A disabled rule may not evaluate today (for
          // example, magnesium without a logged bedtime), but any stale
          // recommendation must still hide.
          const inapplicableIds = inapplicableSupplementRuleIds(activeSlugs);
          await reconcileInapplicableRecommendations(userId, today, inapplicableIds);
          next = await syncRecommendations(userId, today, applicable);
        }
        if (!cancelled) setRecs(next);
      } catch (error) {
        if (!cancelled) console.error('Failed to refresh recommendations:', error);
      }
    }

    void refreshRecommendations();
    return () => {
      cancelled = true;
    };
  }, [user, log, loading, profile, profileLoaded, today, supplements, supplementsLoading, supplementsError]);

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
        <h1 className="text-2xl font-bold">{greeting(resolveFirstName(user))}</h1>
        {coachLine(todayWorkout) && (
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
            {coachLine(todayWorkout)}
          </p>
        )}
      </header>

      <section className="card mb-4" aria-label="Today's compliance">
        <h2 className="section-title">Today</h2>
        <div className="flex items-start justify-between">
          {complianceItems(log, showCreatine, targets.proteinMinG).map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className="rounded-lg py-0.5 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700/60"
            >
              <StatusDot status={item.status} label={item.label} />
            </Link>
          ))}
        </div>
      </section>

      <TodayWorkoutCard today={todayWorkout} />

      <section className="mb-4" aria-label="Quick actions">
        <div className="grid grid-cols-2 gap-3">
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
        {loading || supplementsLoading ? (
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
