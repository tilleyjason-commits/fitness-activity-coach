import rulesJson from '../../rules/rules.json';
import { MEAL_TIMING, muscleForExercise } from './constants';
import type { DailyLog, ExerciseLog, Profile, Severity } from './types';
import { SEVERITY_ORDER } from './types';

/**
 * Rule evaluation engine.
 *
 * Rules live in /rules/rules.json. Each rule has:
 *  - trigger:  a pseudo-path condition ("log.day.complete", "log.sleep.bedtime.exists",
 *              "log.day_of_week == 'Sunday'", ...) deciding whether the rule applies.
 *  - evaluate: a JS-ish boolean expression over daily-log fields, using AND/OR/NOT
 *              keywords ("daily_protein >= 195", "bedtime >= '21:30' AND bedtime <= '22:30'").
 *  - pass/fail: message templates with {expression} interpolation (ternaries allowed,
 *              plus an abs() helper).
 *
 * The engine compiles each expression with new Function() over a flat context built
 * from the day's log, the athlete profile, and weekly derived metrics. Rules whose
 * referenced fields are not logged yet are reported as 'skipped' (gray), not failed.
 */

export interface Rule {
  id: string;
  domain: string;
  description: string;
  trigger: string;
  evaluate: string;
  pass: string;
  fail: string;
  severity: Severity;
  evidence?: string;
}

export type RuleStatus = 'pass' | 'fail' | 'skipped';

export interface RuleResult {
  rule: Rule;
  status: RuleStatus;
  message: string;
}

export type EvalValue = string | number | boolean | null | ((n: number) => number);
export type EvalContext = Record<string, EvalValue>;

interface RawRule {
  id: string;
  domain: string;
  description: string;
  trigger: string;
  evaluate: string;
  pass: string;
  fail: string;
  severity: string;
  evidence?: string;
}

const SEVERITIES: readonly Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

function toSeverity(value: string): Severity {
  return (SEVERITIES as readonly string[]).includes(value) ? (value as Severity) : 'info';
}

let cachedRules: Rule[] | null = null;

/** Flatten every domain group in rules.json into one typed list. */
export function getAllRules(): Rule[] {
  if (cachedRules) return cachedRules;
  const groups = rulesJson.rules as unknown as Record<string, RawRule[]>;
  cachedRules = Object.values(groups)
    .flat()
    .map((raw) => ({ ...raw, severity: toSeverity(raw.severity) }));
  return cachedRules;
}

export function getRuleById(id: string): Rule | null {
  return getAllRules().find((r) => r.id === id) ?? null;
}

/* ------------------------------------------------------------------ */
/* Expression evaluation                                               */
/* ------------------------------------------------------------------ */

const IDENTIFIER_RE = /[A-Za-z_][A-Za-z0-9_]*/g;
const EXPR_KEYWORDS = new Set(['true', 'false', 'null', 'AND', 'OR', 'NOT', 'abs']);

/** Translate the rule DSL (AND/OR/NOT keywords) into JavaScript. */
function translateExpression(expr: string): string {
  return expr
    .replace(/\bAND\b/g, '&&')
    .replace(/\bOR\b/g, '||')
    .replace(/\bNOT\b/g, '!');
}

/** Identifiers an expression reads (string literals stripped first). */
export function referencedFields(expr: string): string[] {
  const stripped = expr.replace(/'[^']*'|"[^"]*"/g, '');
  const matches = stripped.match(IDENTIFIER_RE) ?? [];
  return [...new Set(matches.filter((token) => !EXPR_KEYWORDS.has(token)))];
}

/** Compile and run one DSL expression against the context. Throws on bad syntax. */
export function runExpression(expr: string, context: EvalContext): unknown {
  const keys = Object.keys(context);
  const body = `"use strict"; return (${translateExpression(expr)});`;
  const fn = new Function(...keys, body) as (...args: EvalValue[]) => unknown;
  return fn(...keys.map((k) => context[k]));
}

/**
 * Fill {expression} placeholders in a message template. Runs innermost-first and
 * iterates so templates that nest a placeholder inside a quoted string (the
 * weekly_priority rule does) resolve fully.
 */
export function interpolate(template: string, context: EvalContext): string {
  let out = template;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = out.replace(/\{([^{}]+)\}/g, (match, expr: string) => {
      try {
        const value = runExpression(expr, context);
        if (value === null || value === undefined) return '—';
        return String(value);
      } catch {
        return match;
      }
    });
    if (next === out) break;
    out = next;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Trigger conditions                                                  */
/* ------------------------------------------------------------------ */

const TRAINING_WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

/** Maps trigger pseudo-paths onto context field names. Longest keys match first. */
const TRIGGER_PATHS: Record<string, string> = {
  'log.training.completed': 'training_done',
  'log.training.time': 'training_time',
  'log.last_caffeine_time': 'last_caffeine_time',
  'log.sleep.bedtime': 'bedtime',
  'log.sleep.waketime': 'waketime',
  'log.sleep.quality': 'sleep_quality',
  'log.day_of_week': 'day_of_week',
  'log.dinner_logged': 'dinner_logged',
  'log.nutrition': 'nutrition_logged',
};

/** Decide whether a rule applies to this day's context. */
export function checkTrigger(trigger: string, context: EvalContext): boolean {
  const t = trigger.trim();

  // Day names do not compare lexically; treat the Monday..Friday range as "weekday".
  if (t.includes("day_of_week >= 'Monday'") && t.includes("<= 'Friday'")) {
    return TRAINING_WEEKDAYS.includes(String(context.day_of_week ?? ''));
  }

  return t.split(/\bAND\b/).every((clause) => checkTriggerClause(clause.trim(), context));
}

function resolveTriggerPath(path: string): string {
  return TRIGGER_PATHS[path] ?? path.split('.').pop() ?? path;
}

function checkTriggerClause(clause: string, context: EvalContext): boolean {
  if (clause === 'log.day.complete') {
    return context.day_complete === true;
  }

  if (clause.endsWith('.exists')) {
    const field = resolveTriggerPath(clause.slice(0, -'.exists'.length));
    const value = context[field];
    return value !== null && value !== undefined && value !== '';
  }

  // Rewrite known pseudo-paths to context fields, longest first.
  let expr = clause;
  const paths = Object.keys(TRIGGER_PATHS).sort((a, b) => b.length - a.length);
  for (const path of paths) {
    expr = expr.split(path).join(TRIGGER_PATHS[path]);
  }

  // Bare path with no comparison ("log.training.completed") → truthiness check.
  if (!/[<>=!]/.test(expr)) {
    const field = resolveTriggerPath(expr);
    return Boolean(context[field]);
  }

  try {
    return Boolean(runExpression(expr, context));
  } catch (error) {
    console.error(`Trigger clause "${clause}" failed to evaluate:`, error);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Context building                                                    */
/* ------------------------------------------------------------------ */

/** Postgres TIME columns come back as HH:MM:SS; rule literals are HH:MM. */
export function toHHMM(time: string | null): string | null {
  if (!time) return null;
  return time.length > 5 ? time.slice(0, 5) : time;
}

/** Compare a logged caffeine time against the configured cutoff. */
export function isCaffeineBeforeCutoff(
  time: string | null,
  cutoff: string = MEAL_TIMING.caffeineCutoff,
): boolean {
  const normalized = toHHMM(time);
  return normalized !== null && normalized < cutoff;
}

export interface WeeklyDerived {
  weekly_sets_per_muscle: number | null;
  weekly_face_pulls: number | null;
  weekly_weight_change_lbs: number | null;
  waist_change_inches: number | null;
  weekly_compliance_pct: number | null;
  weekly_performance_trend: 'up' | 'stable' | 'dropping' | null;
  weakest_area: string | null;
  missed_sessions: number | null;
}

export const EMPTY_WEEKLY: WeeklyDerived = {
  weekly_sets_per_muscle: null,
  weekly_face_pulls: null,
  weekly_weight_change_lbs: null,
  waist_change_inches: null,
  weekly_compliance_pct: null,
  weekly_performance_trend: null,
  weakest_area: null,
  missed_sessions: null,
};

export function buildContext(
  log: DailyLog,
  weekly: WeeklyDerived = EMPTY_WEEKLY,
  profile: Profile | null = null,
): EvalContext {
  return {
    // Daily log fields (times normalized to HH:MM for lexical comparison)
    log_date: log.log_date,
    day_of_week: log.day_of_week,
    training_done: log.training_done,
    training_session_type: log.training_session_type,
    compound_rir: log.compound_rir,
    isolation_rir: log.isolation_rir,
    double_progression_followed: log.double_progression_followed,
    barbell_squat_done: log.barbell_squat_done,
    barbell_ohp_done: log.barbell_ohp_done,
    daily_calories: log.daily_calories,
    daily_protein_g: log.daily_protein_g,
    daily_carbs_g: log.daily_carbs_g,
    daily_fat_g: log.daily_fat_g,
    pre_gym_snack_time: toHHMM(log.pre_gym_snack_time),
    post_gym_meal_time: toHHMM(log.post_gym_meal_time),
    snack_3pm_logged: log.snack_3pm_logged,
    casein_taken: log.casein_taken,
    dinner_logged: log.dinner_logged,
    dinner_plates: log.dinner_plates,
    dinner_protein_first: log.dinner_protein_first,
    candy_cravings_today: log.candy_cravings_today,
    creatine_taken: log.creatine_taken,
    vitamin_d_taken: log.vitamin_d_taken,
    magnesium_taken: log.magnesium_taken,
    last_caffeine_time: toHHMM(log.last_caffeine_time),
    caffeine_cutoff_respected: log.caffeine_cutoff_respected,
    bedtime: toHHMM(log.bedtime),
    waketime: toHHMM(log.waketime),
    last_screen_time: toHHMM(log.last_screen_time),
    early_wake: log.early_wake,
    sleep_quality: log.sleep_quality,
    energy_score: log.energy_score,
    stress_score: log.stress_score,
    hunger_score: log.hunger_score,
    weekly_weight_lb: log.weekly_weight_lb,
    weekly_waist_inches: log.weekly_waist_inches,

    // Aliases the rule DSL uses
    daily_protein: log.daily_protein_g,
    day: log.day_of_week,
    wake_time: toHHMM(log.waketime),
    weekly_weight_change: weekly.weekly_weight_change_lbs,

    // Weekly derived metrics
    ...weekly,

    // Trigger synthetics
    day_complete: true,
    nutrition_logged: log.daily_calories !== null || log.daily_protein_g !== null,
    training_time: toHHMM(profile?.training_time ?? '11:00'),

    // Template helper
    abs: (n: number) => Math.abs(n),
  };
}

/* ------------------------------------------------------------------ */
/* Rule evaluation                                                     */
/* ------------------------------------------------------------------ */

export function evaluateRule(rule: Rule, context: EvalContext): RuleResult {
  const missing = referencedFields(rule.evaluate).some(
    (field) => context[field] === null || context[field] === undefined,
  );
  if (missing) {
    return { rule, status: 'skipped', message: rule.description };
  }
  try {
    const passed = Boolean(runExpression(rule.evaluate, context));
    const template = passed ? rule.pass : rule.fail;
    return {
      rule,
      status: passed ? 'pass' : 'fail',
      message: interpolate(template, context),
    };
  } catch (error) {
    console.error(`Rule ${rule.id} evaluation failed:`, error);
    return { rule, status: 'skipped', message: rule.description };
  }
}

/** Evaluate every rule against one day. Rules whose trigger doesn't apply are skipped. */
export function evaluateDay(
  log: DailyLog,
  weekly: WeeklyDerived = EMPTY_WEEKLY,
  profile: Profile | null = null,
): RuleResult[] {
  const context = buildContext(log, weekly, profile);
  return getAllRules().map((rule) => {
    if (!checkTrigger(rule.trigger, context)) {
      return { rule, status: 'skipped' as const, message: rule.description };
    }
    return evaluateRule(rule, context);
  });
}

export function sortBySeverity(results: RuleResult[]): RuleResult[] {
  return [...results].sort(
    (a, b) => SEVERITY_ORDER[a.rule.severity] - SEVERITY_ORDER[b.rule.severity],
  );
}

/* ------------------------------------------------------------------ */
/* Weekly derived metrics                                              */
/* ------------------------------------------------------------------ */

export interface AreaScore {
  key: string;
  label: string;
  passed: number;
  total: number;
  pct: number | null;
}

function scoreArea(key: string, label: string, passed: number, total: number): AreaScore {
  return { key, label, passed, total, pct: total > 0 ? Math.round((passed / total) * 100) : null };
}

/** Per-domain compliance across one week of logs (drives the weekly bar chart). */
export function computeAreaScores(weekLogs: DailyLog[]): AreaScore[] {
  let trainingPass = 0;
  let trainingTotal = 0;
  let proteinPass = 0;
  let proteinTotal = 0;
  let caseinPass = 0;
  let snackPass = 0;
  let caffeinePass = 0;
  let caffeineTotal = 0;
  let sleepPass = 0;
  let sleepTotal = 0;
  let creatinePass = 0;
  const loggedDays = weekLogs.length;

  for (const log of weekLogs) {
    if (TRAINING_WEEKDAYS.includes(log.day_of_week ?? '')) {
      trainingTotal += 1;
      if (log.training_done) trainingPass += 1;
    }
    if (log.daily_protein_g !== null) {
      proteinTotal += 1;
      if (log.daily_protein_g >= 195) proteinPass += 1;
    }
    if (log.casein_taken) caseinPass += 1;
    if (log.snack_3pm_logged) snackPass += 1;
    const caffeine = toHHMM(log.last_caffeine_time);
    if (caffeine !== null) {
      caffeineTotal += 1;
      if (isCaffeineBeforeCutoff(caffeine)) caffeinePass += 1;
    }
    if (log.sleep_quality !== null) {
      sleepTotal += 1;
      if (log.sleep_quality >= 3) sleepPass += 1;
    }
    if (log.creatine_taken) creatinePass += 1;
  }

  return [
    scoreArea('training', 'Training', trainingPass, trainingTotal),
    scoreArea('protein', 'Protein', proteinPass, proteinTotal),
    scoreArea('casein', 'Casein', caseinPass, loggedDays),
    scoreArea('3pm_snack', '3pm snack', snackPass, loggedDays),
    scoreArea('caffeine', 'Caffeine cutoff', caffeinePass, caffeineTotal),
    scoreArea('sleep', 'Sleep quality', sleepPass, sleepTotal),
    scoreArea('creatine', 'Creatine', creatinePass, loggedDays),
  ];
}

const WEAKEST_AREA_CANDIDATES = ['casein', '3pm_snack', 'caffeine', 'training', 'protein'];

function latestValue(
  logs: DailyLog[],
  pick: (log: DailyLog) => number | null,
): number | null {
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    const value = pick(logs[i]);
    if (value !== null) return value;
  }
  return null;
}

function averageRepsByExercise(exercises: ExerciseLog[]): Map<string, number> {
  const sums = new Map<string, { total: number; count: number }>();
  for (const ex of exercises) {
    if (ex.reps_completed === null) continue;
    const key = ex.exercise_name.trim().toLowerCase();
    const entry = sums.get(key) ?? { total: 0, count: 0 };
    entry.total += ex.reps_completed;
    entry.count += 1;
    sums.set(key, entry);
  }
  const averages = new Map<string, number>();
  for (const [key, { total, count }] of sums) {
    averages.set(key, total / count);
  }
  return averages;
}

/**
 * Weekly metrics the Sunday rules read (volume, face pulls, weight/waist deltas,
 * compliance, performance trend, weakest area).
 */
export function computeWeeklyDerived(
  weekLogs: DailyLog[],
  weekExercises: ExerciseLog[],
  prevWeekLogs: DailyLog[] = [],
  prevWeekExercises: ExerciseLog[] = [],
): WeeklyDerived {
  const sorted = [...weekLogs].sort((a, b) => a.log_date.localeCompare(b.log_date));
  const prevSorted = [...prevWeekLogs].sort((a, b) => a.log_date.localeCompare(b.log_date));

  const trainedDays = sorted.filter(
    (log) => TRAINING_WEEKDAYS.includes(log.day_of_week ?? '') && log.training_done,
  ).length;
  const missed_sessions = Math.max(0, 5 - trainedDays);

  // Face pulls: distinct sessions containing a face-pull entry with completed sets
  const facePullDays = new Set(
    weekExercises
      .filter((ex) => /face\s*pull/i.test(ex.exercise_name) && (ex.sets_completed ?? 0) > 0)
      .map((ex) => ex.daily_log_id),
  );

  // Average completed sets per muscle group hit this week
  const setsByMuscle = new Map<string, number>();
  for (const ex of weekExercises) {
    const muscle = muscleForExercise(ex.exercise_name);
    if (!muscle) continue;
    setsByMuscle.set(muscle, (setsByMuscle.get(muscle) ?? 0) + (ex.sets_completed ?? 0));
  }
  const muscleSets = [...setsByMuscle.values()].filter((sets) => sets > 0);
  const weekly_sets_per_muscle = muscleSets.length
    ? Math.round(muscleSets.reduce((a, b) => a + b, 0) / muscleSets.length)
    : null;

  // Weight / waist deltas vs the previous week's weigh-in
  const thisWeight = latestValue(sorted, (l) => l.weekly_weight_lb);
  const prevWeight = latestValue(prevSorted, (l) => l.weekly_weight_lb);
  const weekly_weight_change_lbs =
    thisWeight !== null && prevWeight !== null
      ? Math.round((thisWeight - prevWeight) * 10) / 10
      : null;

  const thisWaist = latestValue(sorted, (l) => l.weekly_waist_inches);
  const prevWaist = latestValue(prevSorted, (l) => l.weekly_waist_inches);
  const waist_change_inches =
    thisWaist !== null && prevWaist !== null
      ? Math.round((thisWaist - prevWaist) * 10) / 10
      : null;

  // Overall compliance across all scored areas
  const areas = computeAreaScores(sorted);
  const totalChecks = areas.reduce((sum, a) => sum + a.total, 0);
  const totalPassed = areas.reduce((sum, a) => sum + a.passed, 0);
  const weekly_compliance_pct =
    totalChecks > 0 ? Math.round((totalPassed / totalChecks) * 100) : null;

  // Weakest area among the coached priorities (rule weekly_priority ternary keys)
  let weakest_area: string | null = null;
  if (sorted.length > 0) {
    let worstPct = 80; // anything at/above 80% is on track
    for (const area of areas) {
      if (!WEAKEST_AREA_CANDIDATES.includes(area.key)) continue;
      if (area.pct !== null && area.pct < worstPct) {
        worstPct = area.pct;
        weakest_area = area.key;
      }
    }
    if (weakest_area === null) weakest_area = 'on_track';
  }

  // Performance trend: avg reps per exercise vs last week.
  // Encoded as up/stable/dropping so the rule's lexical >= 'stable' works.
  let weekly_performance_trend: WeeklyDerived['weekly_performance_trend'] = null;
  const thisReps = averageRepsByExercise(weekExercises);
  const prevReps = averageRepsByExercise(prevWeekExercises);
  const deltas: number[] = [];
  for (const [name, avg] of thisReps) {
    const prev = prevReps.get(name);
    if (prev !== undefined) deltas.push(avg - prev);
  }
  if (deltas.length > 0) {
    const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    weekly_performance_trend = avgDelta <= -2 ? 'dropping' : avgDelta >= 1 ? 'up' : 'stable';
  }

  return {
    weekly_sets_per_muscle,
    weekly_face_pulls: weekExercises.length > 0 || trainedDays > 0 ? facePullDays.size : null,
    weekly_weight_change_lbs,
    waist_change_inches,
    weekly_compliance_pct,
    weekly_performance_trend,
    weakest_area,
    missed_sessions,
  };
}

/** Interpolated "top priority" coaching message for the weekly summary view. */
export function weeklyPriorityMessage(weekly: WeeklyDerived): string | null {
  if (weekly.weakest_area === null) return null;
  const rule = getRuleById('weekly_priority');
  if (!rule) return null;
  const context: EvalContext = {
    ...weekly,
    abs: (n: number) => Math.abs(n),
  };
  return interpolate(rule.fail, context);
}
