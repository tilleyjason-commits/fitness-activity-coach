import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays, format, startOfWeek, subDays } from 'date-fns';
import { ChevronRight, CheckCircle2, Dumbbell, Play } from 'lucide-react';
import { useAuth } from '~/context/AuthContext';
import { useDailyLog } from '~/hooks/useDailyLog';
import { useSupplements } from '~/hooks/useSupplements';
import {
  dismissRecommendation,
  getExerciseLogs,
  getLogsBetween,
  getProfile,
  getRecentWeighIns,
  reconcileInapplicableRecommendations,
  syncRecommendations,
} from '~/lib/db';
import { getActiveWorkout, getWeeklyRoutines, hasCompletedWorkout } from '~/lib/workout-repo';
import { getTodayWeekday, getWorkoutTotals, routineHasItems } from '~/lib/workout-mappers';
import {
  computeWeeklyDerived,
  EMPTY_WEEKLY,
  evaluateDay,
  getRuleById,
  type WeeklyDerived,
} from '~/lib/evaluate';
import {
  activeSlugSet,
  inapplicableSupplementRuleIds,
  isCanonicalActive,
  isSupplementRuleApplicable,
} from '~/lib/supplements';
import { resolveTargets, type MacroTargets } from '~/lib/constants';
import {
  SEVERITY_ORDER,
  type DailyLog,
  type DailyRoutine,
  type Profile,
  type Recommendation,
  type WorkoutState,
} from '~/lib/types';
import { StatusDot, type DotStatus } from '~/components/StatusDot';
import { Skeleton, SkeletonCard } from '~/components/Skeleton';
import { RecommendationCard } from '~/components/RecommendationCard';

const WeightSparkline = lazy(() => import('~/components/WeightSparkline'));

interface ComplianceItem {
  label: string;
  status: DotStatus;
  /** Each glanceable status is also the shortcut to its logging surface. */
  to: string;
}

function recommendationAction(ruleId: string, domain: string | undefined): { to: string; label: string } {
  if (
    ruleId.includes('protein') ||
    ruleId.includes('calories') ||
    ruleId.includes('meal') ||
    ruleId.includes('snack') ||
    ruleId.includes('dinner')
  ) {
    return { to: '/macros', label: 'Log food' };
  }
  if (ruleId.includes('casein')) return { to: '/log/nutrition', label: 'Log PM protein' };
  if (
    ruleId.includes('caffeine') ||
    ruleId.includes('bedtime') ||
    ruleId.includes('wake') ||
    ruleId.includes('screen') ||
    ruleId.includes('sleep')
  ) {
    return { to: '/log/sleep', label: 'Log sleep' };
  }
  if (
    ruleId.includes('creatine') ||
    ruleId.includes('vitamin') ||
    ruleId.includes('magnesium') ||
    ruleId.includes('beta_alanine') ||
    ruleId.includes('omega3')
  ) {
    return { to: '/log/supplements', label: 'Log supplements' };
  }
  if (domain === 'training') return { to: '/training', label: 'Open workout' };
  if (domain === 'recovery') return { to: '/log/subjective', label: 'Log recovery' };
  return { to: '/log', label: 'Open log' };
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
      <section className="card mb-4" aria-label="Today's workout">
        <h2 className="section-title">Today&apos;s workout</h2>
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 flex-1 items-center gap-2.5">
            <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
            <span className="block w-full space-y-1.5">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </span>
          </span>
          <Skeleton className="h-11 w-24 shrink-0 rounded-xl" />
        </div>
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

interface MacroReadingProps {
  label: string;
  /** Optional explicit caption when a target has an acceptable buffer range. */
  caption?: string;
  /** Remaining amount; negative means the target is already exceeded. */
  left: number;
  consumed: number;
  target: number;
  unit?: string;
  /** Bar + figure tint: emerald on track, amber short, red over. */
  tone: 'ok' | 'short' | 'over';
  align?: 'left' | 'right';
}

const TONE_TEXT: Record<MacroReadingProps['tone'], string> = {
  ok: '',
  short: 'text-amber-500',
  over: 'text-red-500',
};

const TONE_BAR: Record<MacroReadingProps['tone'], string> = {
  ok: 'bg-emerald-500',
  short: 'bg-amber-500',
  over: 'bg-red-500',
};

function MacroReading({
  label,
  caption,
  left,
  consumed,
  target,
  unit = '',
  tone,
  align = 'left',
}: MacroReadingProps) {
  const over = left < 0;
  return (
    <div className={align === 'right' ? 'text-right' : ''}>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {caption ?? (over ? `${label} over` : `${label} left`)}
      </p>
      <p className={`text-stat font-bold tabular-nums ${TONE_TEXT[tone]}`}>
        {Math.abs(Math.round(left)).toLocaleString()}
        {unit && <span className="text-base font-semibold">{unit}</span>}
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {Math.round(consumed).toLocaleString()} of {Math.round(target).toLocaleString()}
      </p>
    </div>
  );
}

function MacroBar({ pct, tone, label }: { pct: number; tone: MacroReadingProps['tone']; label: string }) {
  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={`h-full transition-all ${TONE_BAR[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * The two figures Home exists to answer: how much food is left today. Reads
 * from the same daily_logs totals the macro tracker writes, so it never
 * disagrees with the meal pages.
 */
function MacroHero({ log, targets }: { log: DailyLog | null; targets: MacroTargets }) {
  const calories = log?.daily_calories ?? 0;
  const protein = log?.daily_protein_g ?? 0;

  const caloriesLeft = targets.calories - calories;
  const proteinLeft = targets.proteinG - protein;

  const caloriesTone = calories > targets.caloriesMax ? 'over' : 'ok';
  const proteinTone = proteinLeft <= 0 ? 'ok' : protein > 0 ? 'short' : 'ok';

  const pct = (value: number, target: number) =>
    target <= 0 ? 0 : Math.min(100, Math.max(0, (value / target) * 100));

  return (
    <Link
      to="/macros"
      className="card mb-4 block transition-colors hover:border-emerald-500/50"
      aria-label="Today's macros — open the meal tracker"
    >
      <div className="mb-3 flex items-start justify-between gap-4">
        <MacroReading
          label="Calories"
          caption={
            calories > targets.caloriesMax
              ? 'Calories over range'
              : calories > targets.calories
                ? 'Calories above target · in range'
                : 'Calories left'
          }
          left={caloriesLeft}
          consumed={calories}
          target={targets.calories}
          tone={caloriesTone}
        />
        <MacroReading
          label="Protein"
          left={proteinLeft}
          consumed={protein}
          target={targets.proteinG}
          unit="g"
          tone={proteinTone}
          align="right"
        />
      </div>
      <div className="space-y-1.5">
        <MacroBar pct={pct(calories, targets.calories)} tone={caloriesTone} label="Calories logged" />
        <MacroBar pct={pct(protein, targets.proteinG)} tone={proteinTone} label="Protein logged" />
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const today = format(new Date(), 'yyyy-MM-dd');
  const { log, loading } = useDailyLog(today);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [weighIns, setWeighIns] = useState<DailyLog[]>([]);
  const [weekly, setWeekly] = useState<WeeklyDerived>(EMPTY_WEEKLY);
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

  // Weekly-derived context (volume, weight/waist trend, weakest area) for the
  // rule engine — same current-week/prior-week window WeeklySummary uses.
  // Without this, Home evaluates every rule with EMPTY_WEEKLY and the Sunday
  // weekly rules never fire on the surface most people actually look at.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const userId = user.id;

    async function loadWeekly() {
      try {
        const weekStartDate = startOfWeek(new Date(), { weekStartsOn: 1 });
        const weekStart = format(weekStartDate, 'yyyy-MM-dd');
        const weekEnd = format(addDays(weekStartDate, 6), 'yyyy-MM-dd');
        const prevStart = format(subDays(weekStartDate, 7), 'yyyy-MM-dd');
        const prevEnd = format(subDays(weekStartDate, 1), 'yyyy-MM-dd');

        const [logs, prevLogs] = await Promise.all([
          getLogsBetween(userId, weekStart, weekEnd),
          getLogsBetween(userId, prevStart, prevEnd),
        ]);
        const [exercises, prevExercises] = await Promise.all([
          getExerciseLogs(logs.map((l) => l.id)),
          getExerciseLogs(prevLogs.map((l) => l.id)),
        ]);
        if (cancelled) return;
        setWeekly(computeWeeklyDerived(logs, exercises, prevLogs, prevExercises));
      } catch {
        // Degrade to EMPTY_WEEKLY — Home must still render today's rules offline.
        if (!cancelled) setWeekly(EMPTY_WEEKLY);
      }
    }

    void loadWeekly();
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
    const results = evaluateDay(log, weekly, profile);

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
  }, [
    user,
    log,
    loading,
    profile,
    profileLoaded,
    today,
    supplements,
    supplementsLoading,
    supplementsError,
    weekly,
  ]);

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
        <h1 className="text-display font-bold">{greeting(resolveFirstName(user))}</h1>
        {coachLine(todayWorkout) && (
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
            {coachLine(todayWorkout)}
          </p>
        )}
      </header>

      <MacroHero log={log} targets={targets} />

      <TodayWorkoutCard today={todayWorkout} />

      {/* Secondary glance: status only, each dot still its own shortcut. */}
      <section className="card mb-4 py-3" aria-label="Today's compliance">
        <div className="flex flex-wrap items-center justify-between gap-y-2">
          {complianceItems(log, showCreatine, targets.proteinMinG).map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className="rounded-lg px-1 py-0.5 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700/60"
            >
              <StatusDot status={item.status} label={item.label} layout="inline" />
            </Link>
          ))}
        </div>
      </section>

      <section className="mb-4" aria-label="Recommendations">
        <h2 className="section-title">Needs attention</h2>
        {loading || supplementsLoading ? (
          <SkeletonCard label="Evaluating today's rules" lines={['w-1/4', 'w-full', 'w-3/5']} />
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
            {/* Home shows the single highest-severity item; the rest live on Progress. */}
            {(() => {
              const rule = getRuleById(sortedRecs[0].rule_id);
              const action = recommendationAction(sortedRecs[0].rule_id, rule?.domain);
              return (
                <RecommendationCard
                  severity={sortedRecs[0].severity}
                  message={sortedRecs[0].message}
                  domain={rule?.domain}
                  actionTo={action.to}
                  actionLabel={action.label}
                  evidence={rule?.evidence}
                  onDismiss={() => void handleDismiss(sortedRecs[0].id)}
                />
              );
            })()}
            {sortedRecs.length > 1 && (
              <Link
                to="/weekly"
                className="flex min-h-11 items-center justify-between rounded-xl px-1 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                {sortedRecs.length - 1} more in Progress
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
            )}
          </div>
        )}
      </section>

      {sparkData.length >= 2 && (
        <Suspense
          fallback={(
            <section className="card" aria-label="Weight trend">
              <h2 className="section-title">Weight trend</h2>
              <Skeleton className="h-20 w-full rounded-lg" />
            </section>
          )}
        >
          <WeightSparkline data={sparkData} />
        </Suspense>
      )}
    </div>
  );
}
