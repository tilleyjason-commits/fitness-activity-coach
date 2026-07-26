import { addDays, differenceInCalendarDays, format, parseISO, startOfWeek } from 'date-fns';
import type { DailyLog, ExerciseLog } from './types';

/**
 * Multi-week trend math for the Progress page. Pure functions over the rows
 * already loaded for a date range — weeks start Monday, matching the M–F
 * training split and Sunday weigh-in used everywhere else in the app.
 */

export interface WeekBucket {
  /** Monday of the week, yyyy-MM-dd. */
  weekStart: string;
  /** Short axis label, e.g. "7/21". */
  label: string;
  daysLogged: number;
  trainingDays: number;
  caloriesAvg: number | null;
  proteinAvg: number | null;
  /** Completed sets across the week. */
  sets: number;
  /** Tonnage: sets × reps × weight, rounded to whole pounds. */
  volumeLb: number;
}

export const RANGE_WEEKS = [4, 12] as const;

export type RangeWeeks = (typeof RANGE_WEEKS)[number];

function toDate(isoDate: string): Date {
  return parseISO(`${isoDate}T00:00:00`);
}

function mondayOf(isoDate: string): Date {
  return startOfWeek(toDate(isoDate), { weekStartsOn: 1 });
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/**
 * A day counts as logged once any non-default tracked field carries a value.
 * Schema defaults such as meals_count=4 and full_rom_followed=true are
 * intentionally excluded because they exist before the user records anything.
 * Written against null *and* undefined: partial rows reach the client whenever
 * a column is added ahead of its migration.
 */
export function hasLoggedData(log: DailyLog): boolean {
  const present = (value: unknown) => value !== null && value !== undefined && value !== '';
  return (
    log.training_done === true ||
    present(log.training_session_type) ||
    present(log.compound_rir) ||
    present(log.isolation_rir) ||
    present(log.double_progression_followed) ||
    log.barbell_squat_done === true ||
    log.barbell_ohp_done === true ||
    present(log.daily_calories) ||
    present(log.daily_protein_g) ||
    present(log.daily_carbs_g) ||
    present(log.daily_fat_g) ||
    present(log.pre_gym_snack_time) ||
    present(log.post_gym_meal_time) ||
    log.snack_3pm_logged === true ||
    log.casein_taken === true ||
    log.dinner_logged === true ||
    log.dinner_plates > 0 ||
    log.dinner_protein_first === true ||
    log.candy_cravings_today > 0 ||
    log.creatine_taken === true ||
    log.beta_alanine_taken === true ||
    log.omega3_taken === true ||
    present(log.caffeine_mg) ||
    log.vitamin_d_taken === true ||
    log.magnesium_taken === true ||
    present(log.last_caffeine_time) ||
    present(log.caffeine_cutoff_respected) ||
    present(log.bedtime) ||
    present(log.waketime) ||
    present(log.last_screen_time) ||
    log.early_wake === true ||
    present(log.sleep_quality) ||
    present(log.energy_score) ||
    present(log.stress_score) ||
    present(log.hunger_score) ||
    present(log.compound_rest_sec) ||
    present(log.isolation_rest_sec) ||
    present(log.session_minutes) ||
    present(log.last_deload_date) ||
    present(log.weekly_weight_lb) ||
    present(log.weekly_waist_inches) ||
    present(log.notes)
  );
}

/** Start date (inclusive) of a range ending in the week containing `today`. */
export function rangeStart(today: string, weeks: RangeWeeks): string {
  return format(addDays(mondayOf(today), -7 * (weeks - 1)), 'yyyy-MM-dd');
}

/**
 * Group logs into consecutive Monday-start weeks covering the whole range,
 * so empty weeks still appear on the axis instead of collapsing the chart.
 */
export function bucketWeeks(
  logs: DailyLog[],
  exerciseLogs: ExerciseLog[],
  today: string,
  weeks: RangeWeeks,
): WeekBucket[] {
  const firstMonday = mondayOf(rangeStart(today, weeks));
  const setsByLogId = new Map<string, { sets: number; volume: number }>();

  for (const entry of exerciseLogs) {
    const sets = entry.sets_completed ?? 0;
    const reps = entry.reps_completed ?? 0;
    const weight = entry.weight_lb ?? 0;
    const current = setsByLogId.get(entry.daily_log_id) ?? { sets: 0, volume: 0 };
    current.sets += sets;
    current.volume += sets * reps * weight;
    setsByLogId.set(entry.daily_log_id, current);
  }

  const buckets: WeekBucket[] = [];
  for (let index = 0; index < weeks; index += 1) {
    const start = addDays(firstMonday, index * 7);
    buckets.push({
      weekStart: format(start, 'yyyy-MM-dd'),
      label: format(start, 'M/d'),
      daysLogged: 0,
      trainingDays: 0,
      caloriesAvg: null,
      proteinAvg: null,
      sets: 0,
      volumeLb: 0,
    });
  }

  const byWeekStart = new Map(buckets.map((bucket) => [bucket.weekStart, bucket]));
  const calories = new Map<string, number[]>();
  const protein = new Map<string, number[]>();

  for (const log of logs) {
    const key = format(mondayOf(log.log_date), 'yyyy-MM-dd');
    const bucket = byWeekStart.get(key);
    if (!bucket) continue;

    if (hasLoggedData(log)) bucket.daysLogged += 1;
    if (log.training_done) bucket.trainingDays += 1;
    if (log.daily_calories !== null) {
      calories.set(key, [...(calories.get(key) ?? []), log.daily_calories]);
    }
    if (log.daily_protein_g !== null) {
      protein.set(key, [...(protein.get(key) ?? []), log.daily_protein_g]);
    }

    const totals = setsByLogId.get(log.id);
    if (totals) {
      bucket.sets += totals.sets;
      bucket.volumeLb += totals.volume;
    }
  }

  for (const bucket of buckets) {
    bucket.caloriesAvg = average(calories.get(bucket.weekStart) ?? []);
    bucket.proteinAvg = average(protein.get(bucket.weekStart) ?? []);
    bucket.volumeLb = Math.round(bucket.volumeLb);
  }

  return buckets;
}

/**
 * Consecutive logged days ending today. A day that has not been logged yet
 * does not break the streak — it counts back from yesterday instead, so the
 * number never collapses to zero first thing in the morning.
 */
export function computeLoggingStreak(logs: DailyLog[], today: string): number {
  const logged = new Set(logs.filter(hasLoggedData).map((log) => log.log_date));
  if (logged.size === 0) return 0;

  const todayDate = toDate(today);
  let streak = 0;
  let cursor = logged.has(today) ? todayDate : addDays(todayDate, -1);

  while (logged.has(format(cursor, 'yyyy-MM-dd'))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

/** Days in the range that carry any logged data. */
export function daysLoggedInRange(logs: DailyLog[]): number {
  return logs.filter(hasLoggedData).length;
}

/**
 * How close an average sits to its target, as a percentage capped at 100.
 * Used for the adherence readout beside the macro trend.
 */
export function adherencePct(value: number | null, target: number): number | null {
  if (value === null || target <= 0) return null;
  return Math.min(100, Math.round((value / target) * 100));
}

/** Whole days between two ISO dates, for range labelling. */
export function spanDays(startDate: string, endDate: string): number {
  return Math.abs(differenceInCalendarDays(toDate(endDate), toDate(startDate))) + 1;
}
