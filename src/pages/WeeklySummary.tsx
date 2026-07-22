import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays, format, startOfWeek, subDays } from 'date-fns';
import { CheckCircle2, ChevronLeft, ChevronRight, Target } from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '~/context/AuthContext';
import {
  dismissRecommendation,
  getExerciseLogs,
  getLogsBetween,
  getRecentWeighIns,
  getRecommendationsBetween,
  upsertWeeklySummary,
} from '~/lib/db';
import {
  computeAreaScores,
  computeWeeklyDerived,
  getRuleById,
  weeklyPriorityMessage,
  type AreaScore,
  type WeeklyDerived,
} from '~/lib/evaluate';
import { CHART } from '~/lib/constants';
import { SEVERITY_ORDER, type DailyLog, type Recommendation } from '~/lib/types';
import { PageHeader } from '~/components/PageHeader';
import { RecommendationCard } from '~/components/RecommendationCard';
import { useIsDark } from '~/hooks/useIsDark';

const WEAKEST_BAR_COLOR = '#f59e0b'; // amber-500 — flags the weakest domain

function average(values: number[], decimals = 0): number | null {
  if (values.length === 0) return null;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const factor = 10 ** decimals;
  return Math.round(avg * factor) / factor;
}

/** One rec per rule (most recent day wins), severity-sorted, active only. */
function activeWeekRecs(recs: Recommendation[]): Recommendation[] {
  const byRule = new Map<string, Recommendation>();
  for (const rec of recs) {
    if (rec.passed || rec.dismissed) continue;
    const current = byRule.get(rec.rule_id);
    if (!current || rec.log_date > current.log_date) byRule.set(rec.rule_id, rec);
  }
  return [...byRule.values()].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
}

export default function WeeklySummary() {
  const { user } = useAuth();
  const isDark = useIsDark();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weekLogs, setWeekLogs] = useState<DailyLog[]>([]);
  const [areas, setAreas] = useState<AreaScore[]>([]);
  const [weekly, setWeekly] = useState<WeeklyDerived | null>(null);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [weighIns, setWeighIns] = useState<DailyLog[]>([]);

  // 0 = the current Monday–Sunday window; positive values page back in time.
  const [weekOffset, setWeekOffset] = useState(0);
  const weekStartDate = subDays(startOfWeek(new Date(), { weekStartsOn: 1 }), weekOffset * 7);
  const weekStart = format(weekStartDate, 'yyyy-MM-dd');
  const weekEnd = format(addDays(weekStartDate, 6), 'yyyy-MM-dd');

  useEffect(() => {
    if (!user) return;
    let active = true;

    async function load(userId: string) {
      setLoading(true);
      setError(null);
      try {
        const prevStart = format(subDays(weekStartDate, 7), 'yyyy-MM-dd');
        const prevEnd = format(subDays(weekStartDate, 1), 'yyyy-MM-dd');

        const [logs, prevLogs, weekRecs, recentWeighIns] = await Promise.all([
          getLogsBetween(userId, weekStart, weekEnd),
          getLogsBetween(userId, prevStart, prevEnd),
          getRecommendationsBetween(userId, weekStart, weekEnd),
          getRecentWeighIns(userId, 12),
        ]);
        const [exercises, prevExercises] = await Promise.all([
          getExerciseLogs(logs.map((l) => l.id)),
          getExerciseLogs(prevLogs.map((l) => l.id)),
        ]);
        if (!active) return;

        const areaScores = computeAreaScores(logs);
        const derived = computeWeeklyDerived(logs, exercises, prevLogs, prevExercises);
        setWeekLogs(logs);
        setAreas(areaScores);
        setWeekly(derived);
        setRecs(activeWeekRecs(weekRecs));
        setWeighIns(recentWeighIns);

        // Keep the weekly_summaries table in sync with what this page computed.
        if (logs.length > 0) {
          const pct = (key: string) =>
            areaScores.find((a) => a.key === key)?.pct ?? null;
          const proteins = logs
            .map((l) => l.daily_protein_g)
            .filter((v): v is number => v !== null);
          const calories = logs
            .map((l) => l.daily_calories)
            .filter((v): v is number => v !== null);
          const sleep = logs
            .map((l) => l.sleep_quality)
            .filter((v): v is number => v !== null);
          upsertWeeklySummary({
            user_id: userId,
            week_start: weekStart,
            training_compliance_pct: pct('training'),
            protein_avg_g: average(proteins),
            calories_avg: average(calories),
            casein_compliance_pct: pct('casein'),
            snack_3pm_compliance_pct: pct('3pm_snack'),
            caffeine_cutoff_pct: pct('caffeine'),
            sleep_quality_avg: average(sleep, 1),
            candy_cravings_total: logs.reduce((sum, l) => sum + l.candy_cravings_today, 0),
            weight_change_lb: derived.weekly_weight_change_lbs,
            waist_change_inches: derived.waist_change_inches,
            compliance_pct: derived.weekly_compliance_pct,
            weakest_area: derived.weakest_area,
          }).catch(console.error);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load weekly summary');
      } finally {
        if (active) setLoading(false);
      }
    }

    void load(user.id);
    return () => {
      active = false;
    };
    // weekStart pins the whole date window; the Date objects derive from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, weekStart]);

  const chartData = useMemo(
    () =>
      areas.map((area) => ({
        label: area.label,
        pct: area.pct ?? 0,
        logged: area.pct !== null,
        isWeakest: weekly?.weakest_area === area.key,
      })),
    [areas, weekly],
  );

  const weightTrend = useMemo(
    () =>
      weighIns
        .filter((l) => l.weekly_weight_lb !== null)
        .map((l) => ({
          date: format(new Date(`${l.log_date}T00:00:00`), 'M/d'),
          weight: l.weekly_weight_lb as number,
          waist: l.weekly_waist_inches,
        })),
    [weighIns],
  );

  const priority = weekly ? weeklyPriorityMessage(weekly) : null;
  const onTrack = weekly?.weakest_area === 'on_track';

  async function handleDismiss(id: string) {
    setRecs((current) => current.filter((r) => r.id !== id));
    try {
      await dismissRecommendation(id);
    } catch (e) {
      console.error(e);
    }
  }

  const tooltipStyle = {
    background: isDark ? '#0f172a' : '#ffffff',
    border: `1px solid ${isDark ? CHART.gridDark : CHART.gridLight}`,
    borderRadius: 8,
    fontSize: 12,
  };

  const weekPager = (
    <div className="mb-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700/60 dark:bg-slate-800">
      <button
        type="button"
        onClick={() => setWeekOffset((offset) => offset + 1)}
        aria-label="Previous week"
        className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <span className="text-sm font-semibold tabular-nums">
        {format(weekStartDate, 'MMM d')} – {format(addDays(weekStartDate, 6), 'MMM d')}
        {weekOffset === 0 && (
          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-300">
            This week
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={() => setWeekOffset((offset) => Math.max(0, offset - 1))}
        disabled={weekOffset === 0}
        aria-label="Next week"
        className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );

  if (loading) {
    return (
      <div>
        <PageHeader title="Progress" />
        {weekPager}
        <div className="card animate-pulse text-sm text-slate-500 dark:text-slate-400">
          Crunching the week&apos;s numbers…
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Progress" />
      {weekPager}

      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      {weekLogs.length === 0 ? (
        <div className="card mb-4 text-sm text-slate-600 dark:text-slate-300">
          <p className="mb-3">
            Nothing logged {weekOffset === 0 ? 'this week yet' : 'that week'}. Compliance and
            trends appear once a day is logged.
          </p>
          <div className="flex gap-2">
            <Link
              to="/macros"
              className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
            >
              Log a meal
            </Link>
            <Link
              to="/training"
              className="flex-1 rounded-xl border border-slate-300 py-2.5 text-center text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Log training
            </Link>
          </div>
        </div>
      ) : (
        <>
          <section className="card mb-4" aria-label="Compliance by domain">
            <div className="mb-1 flex items-baseline justify-between">
              <h2 className="section-title mb-0">Compliance</h2>
              {weekly?.weekly_compliance_pct !== null && weekly !== null && (
                <span className="text-sm font-semibold">{weekly.weekly_compliance_pct}%</span>
              )}
            </div>
            <div style={{ height: chartData.length * 34 + 24 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                >
                  <XAxis type="number" domain={[0, 100]} hide />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={98}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: CHART.textMuted, fontSize: 11 }}
                  />
                  <Tooltip
                    cursor={{ fill: isDark ? '#33415555' : '#e2e8f055' }}
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: CHART.textMuted }}
                    itemStyle={{ color: isDark ? '#f1f5f9' : '#0f172a' }}
                    formatter={(value: number, _name, entry) => [
                      entry.payload.logged ? `${value}%` : 'No data yet',
                      'Compliance',
                    ]}
                  />
                  <Bar dataKey="pct" radius={[0, 6, 6, 0]} barSize={16} background={{ fill: isDark ? '#334155' : '#e2e8f0', radius: 6 }}>
                    {chartData.map((entry) => (
                      <Cell
                        key={entry.label}
                        fill={
                          !entry.logged
                            ? CHART.textMuted
                            : entry.isWeakest
                              ? WEAKEST_BAR_COLOR
                              : CHART.primary
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {priority && (
            <section
              className={`card mb-4 flex items-start gap-3 border-l-4 ${
                onTrack ? 'border-l-emerald-500' : 'border-l-amber-500'
              }`}
              aria-label="This week's priority"
            >
              {onTrack ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" aria-hidden />
              ) : (
                <Target className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden />
              )}
              <div className="min-w-0">
                <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Top priority
                </p>
                <p className="text-sm leading-snug text-slate-700 dark:text-slate-200">{priority}</p>
              </div>
            </section>
          )}

          {(weekly?.weekly_weight_change_lbs !== null || weekly?.waist_change_inches !== null) &&
            weekly !== null && (
              <section className="card mb-4" aria-label="Weekly change">
                <h2 className="section-title">Change vs last week</h2>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-lg font-bold">
                      {weekly.weekly_weight_change_lbs === null
                        ? '—'
                        : `${weekly.weekly_weight_change_lbs > 0 ? '+' : ''}${weekly.weekly_weight_change_lbs} lb`}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Weight</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold">
                      {weekly.waist_change_inches === null
                        ? '—'
                        : `${weekly.waist_change_inches > 0 ? '+' : ''}${weekly.waist_change_inches} in`}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Waist</p>
                  </div>
                </div>
              </section>
            )}
        </>
      )}

      {/* Body composition reads as one block: change vs last week, then trend. */}
      {weightTrend.length >= 2 && (
        <section className="card mb-4" aria-label="Weight trend">
          <h2 className="section-title">Weight trend</h2>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weightTrend} margin={{ top: 6, right: 4, bottom: 0, left: -18 }}>
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: CHART.textMuted, fontSize: 11 }}
                />
                <YAxis
                  domain={['dataMin - 2', 'dataMax + 2']}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: CHART.textMuted, fontSize: 11 }}
                  tickFormatter={(v: number) => `${Math.round(v)}`}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: CHART.textMuted }}
                  itemStyle={{ color: isDark ? '#f1f5f9' : '#0f172a' }}
                  formatter={(value: number, name: string) => [
                    name === 'weight' ? `${value} lb` : `${value} in`,
                    name === 'weight' ? 'Weight' : 'Waist',
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke={CHART.primary}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {weightTrend.some((point) => point.waist !== null) && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Latest waist:{' '}
              {[...weightTrend].reverse().find((point) => point.waist !== null)?.waist} in
            </p>
          )}
        </section>
      )}

      <section className="mb-4" aria-label="This week's recommendations">
        <h2 className="section-title">Recommendations</h2>
        {recs.length === 0 ? (
          <div className="card flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" aria-hidden />
            <p className="text-sm text-slate-600 dark:text-slate-300">
              No open recommendations this week.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {recs.map((rec) => (
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

    </div>
  );
}
