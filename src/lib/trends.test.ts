import { describe, expect, it } from 'vitest';
import {
  adherencePct,
  bucketWeeks,
  computeLoggingStreak,
  daysLoggedInRange,
  hasLoggedData,
  rangeStart,
} from './trends';
import type { DailyLog, ExerciseLog } from './types';

/**
 * Trend math must survive gaps: missed days, empty weeks, and a today that
 * has not been logged yet are the normal case, not the exception.
 */

function makeLog(overrides: Partial<DailyLog> & { log_date: string }): DailyLog {
  return {
    id: `log-${overrides.log_date}`,
    user_id: 'user-1',
    day_of_week: null,
    training_done: false,
    training_session_type: null,
    compound_rir: null,
    isolation_rir: null,
    double_progression_followed: null,
    barbell_squat_done: false,
    barbell_ohp_done: false,
    daily_calories: null,
    daily_protein_g: null,
    daily_carbs_g: null,
    daily_fat_g: null,
    pre_gym_snack_time: null,
    post_gym_meal_time: null,
    snack_3pm_logged: false,
    casein_taken: false,
    dinner_logged: false,
    dinner_plates: 0,
    dinner_protein_first: false,
    candy_cravings_today: 0,
    creatine_taken: false,
    beta_alanine_taken: false,
    omega3_taken: false,
    caffeine_mg: null,
    vitamin_d_taken: false,
    magnesium_taken: false,
    last_caffeine_time: null,
    caffeine_cutoff_respected: null,
    bedtime: null,
    waketime: null,
    last_screen_time: null,
    early_wake: false,
    sleep_quality: null,
    energy_score: null,
    stress_score: null,
    hunger_score: null,
    meals_count: null,
    compound_rest_sec: null,
    isolation_rest_sec: null,
    session_minutes: null,
    full_rom_followed: false,
    last_deload_date: null,
    weekly_weight_lb: null,
    weekly_waist_inches: null,
    ...overrides,
  } as DailyLog;
}

function makeExerciseLog(overrides: Partial<ExerciseLog> & { daily_log_id: string }): ExerciseLog {
  return {
    id: `ex-${overrides.daily_log_id}`,
    exercise_name: 'Leg Press',
    sets_completed: 3,
    target_sets: 3,
    reps_completed: 10,
    target_reps: '10',
    weight_lb: 100,
    rir: 2,
    notes: null,
    ...overrides,
  };
}

// 2026-07-25 is a Saturday; its Monday is 2026-07-20.
const TODAY = '2026-07-25';

describe('rangeStart', () => {
  it('starts on the Monday n-1 weeks before the current week', () => {
    expect(rangeStart(TODAY, 4)).toBe('2026-06-29');
    expect(rangeStart(TODAY, 12)).toBe('2026-05-04');
  });
});

describe('hasLoggedData', () => {
  it('treats any tracked value as a logged day', () => {
    expect(hasLoggedData(makeLog({ log_date: TODAY, daily_calories: 2000 }))).toBe(true);
    expect(hasLoggedData(makeLog({ log_date: TODAY, training_done: true }))).toBe(true);
    expect(hasLoggedData(makeLog({ log_date: TODAY, sleep_quality: 4 }))).toBe(true);
  });

  it('leaves an untouched row uncounted', () => {
    expect(hasLoggedData(makeLog({ log_date: TODAY }))).toBe(false);
  });
});

describe('bucketWeeks', () => {
  it('emits one bucket per week in the range, including empty weeks', () => {
    const buckets = bucketWeeks([], [], TODAY, 4);
    expect(buckets).toHaveLength(4);
    expect(buckets[0].weekStart).toBe('2026-06-29');
    expect(buckets[3].weekStart).toBe('2026-07-20');
    expect(buckets[3].daysLogged).toBe(0);
    expect(buckets[3].caloriesAvg).toBeNull();
  });

  it('averages calories and protein only across days that logged them', () => {
    const logs = [
      makeLog({ log_date: '2026-07-20', daily_calories: 2400, daily_protein_g: 200 }),
      makeLog({ log_date: '2026-07-21', daily_calories: 2600, daily_protein_g: 180 }),
      makeLog({ log_date: '2026-07-22', training_done: true }),
    ];
    const week = bucketWeeks(logs, [], TODAY, 4)[3];

    expect(week.caloriesAvg).toBe(2500);
    expect(week.proteinAvg).toBe(190);
    expect(week.daysLogged).toBe(3);
    expect(week.trainingDays).toBe(1);
  });

  it('sums completed sets and tonnage from exercise logs', () => {
    const logs = [makeLog({ log_date: '2026-07-21', training_done: true })];
    const exercises = [
      makeExerciseLog({ daily_log_id: 'log-2026-07-21', sets_completed: 3, reps_completed: 10, weight_lb: 100 }),
      makeExerciseLog({
        id: 'ex-2',
        daily_log_id: 'log-2026-07-21',
        sets_completed: 4,
        reps_completed: 8,
        weight_lb: 50,
      }),
    ];
    const week = bucketWeeks(logs, exercises, TODAY, 4)[3];

    expect(week.sets).toBe(7);
    expect(week.volumeLb).toBe(3 * 10 * 100 + 4 * 8 * 50);
  });

  it('ignores logs that fall outside the range', () => {
    const logs = [makeLog({ log_date: '2026-01-05', daily_calories: 9999 })];
    const buckets = bucketWeeks(logs, [], TODAY, 4);
    expect(buckets.every((bucket) => bucket.caloriesAvg === null)).toBe(true);
  });

  it('tolerates exercise rows with missing reps or weight', () => {
    const logs = [makeLog({ log_date: '2026-07-21', training_done: true })];
    const exercises = [
      makeExerciseLog({ daily_log_id: 'log-2026-07-21', reps_completed: null, weight_lb: null }),
    ];
    const week = bucketWeeks(logs, exercises, TODAY, 4)[3];

    expect(week.sets).toBe(3);
    expect(week.volumeLb).toBe(0);
  });
});

describe('computeLoggingStreak', () => {
  it('counts consecutive days ending today', () => {
    const logs = ['2026-07-23', '2026-07-24', '2026-07-25'].map((log_date) =>
      makeLog({ log_date, daily_calories: 2000 }),
    );
    expect(computeLoggingStreak(logs, TODAY)).toBe(3);
  });

  it('keeps the streak alive when today has not been logged yet', () => {
    const logs = ['2026-07-23', '2026-07-24'].map((log_date) =>
      makeLog({ log_date, daily_calories: 2000 }),
    );
    expect(computeLoggingStreak(logs, TODAY)).toBe(2);
  });

  it('breaks on a genuine gap', () => {
    const logs = ['2026-07-21', '2026-07-24'].map((log_date) =>
      makeLog({ log_date, daily_calories: 2000 }),
    );
    expect(computeLoggingStreak(logs, TODAY)).toBe(1);
  });

  it('returns zero with nothing logged', () => {
    expect(computeLoggingStreak([], TODAY)).toBe(0);
    expect(computeLoggingStreak([makeLog({ log_date: TODAY })], TODAY)).toBe(0);
  });
});

describe('daysLoggedInRange and adherencePct', () => {
  it('counts only days carrying data', () => {
    const logs = [
      makeLog({ log_date: '2026-07-20', daily_calories: 2000 }),
      makeLog({ log_date: '2026-07-21' }),
    ];
    expect(daysLoggedInRange(logs)).toBe(1);
  });

  it('caps adherence at 100 and passes through nulls', () => {
    expect(adherencePct(200, 200)).toBe(100);
    expect(adherencePct(260, 200)).toBe(100);
    expect(adherencePct(150, 200)).toBe(75);
    expect(adherencePct(null, 200)).toBeNull();
  });
});
