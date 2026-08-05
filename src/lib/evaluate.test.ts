import { describe, expect, it, vi } from 'vitest';
import {
  buildContext,
  checkTrigger,
  evaluateRule,
  getRuleById,
  isCaffeineBeforeCutoff,
  referencedFields,
  runExpression,
  type Rule,
} from './evaluate';
import type { DailyLog, Profile } from './types';

// These regression tests cover the rule engine's public pure behavior. They do
// not execute untrusted rule text; rules are bundled application assets.
describe('evaluate rule helpers', () => {
  it('supports the documented AND/OR/NOT expression DSL', () => {
    expect(runExpression('protein >= 195 AND NOT skipped', { protein: 200, skipped: false })).toBe(true);
  });

  it('supports ternary and abs helpers used by message templates', () => {
    expect(runExpression("daily_calories > 2650 ? 'high' : 'low'", { daily_calories: 2800 })).toBe('high');
    expect(runExpression('abs(weekly_weight_change)', { weekly_weight_change: -1.5, abs: Math.abs })).toBe(1.5);
  });

  it('extracts referenced fields without treating string contents as identifiers', () => {
    expect(referencedFields("bedtime >= '21:30' AND bedtime <= '22:30'"))
      .toEqual(['bedtime']);
  });

  it('uses an injectable caffeine cutoff rather than a hardcoded time', () => {
    expect(isCaffeineBeforeCutoff('14:30:00', '15:00')).toBe(true);
    expect(isCaffeineBeforeCutoff('15:00:00', '15:00')).toBe(false);
  });

  it('treats missing caffeine time as not scorable', () => {
    expect(isCaffeineBeforeCutoff(null, '15:00')).toBe(false);
  });
});

describe('checkTrigger path rewriting', () => {
  it('evaluates bare log.field comparisons against the flat context', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(checkTrigger('log.training_done == true', { training_done: true })).toBe(true);
    expect(checkTrigger('log.training_done == true', { training_done: false })).toBe(false);
    expect(checkTrigger('log.daily_protein_g > 100', { daily_protein_g: 150 })).toBe(true);
    expect(checkTrigger('log.daily_fat_g > 0', { daily_fat_g: 0 })).toBe(false);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('still supports nested pseudo-paths and .exists checks', () => {
    expect(checkTrigger('log.training.completed == true', { training_done: true })).toBe(true);
    expect(checkTrigger('log.sleep.bedtime.exists', { bedtime: '22:00' })).toBe(true);
    expect(checkTrigger('log.nutrition.exists', { nutrition_logged: true })).toBe(true);
  });
});

describe('evaluateRule with malformed or unsupported rules', () => {
  const baseRule: Rule = {
    id: 'test_rule',
    domain: 'test',
    description: 'Test rule description',
    trigger: 'log.day.complete',
    evaluate: 'protein >= 195',
    pass: 'ok',
    fail: 'not ok',
    severity: 'medium',
  };

  it('reports a rule with malformed expression syntax as skipped, not failed or thrown', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const rule = { ...baseRule, evaluate: 'protein >= AND OR ((' };
    const result = evaluateRule(rule, { protein: 200 });
    expect(result.status).toBe('skipped');
    expect(result.message).toBe(rule.description);
    consoleError.mockRestore();
  });

  it('skips a rule whose referenced fields are not logged yet instead of failing it', () => {
    const result = evaluateRule(baseRule, { protein: null });
    expect(result.status).toBe('skipped');
    expect(result.message).toBe(baseRule.description);
  });

  it('still passes and fails well-formed rules against logged fields', () => {
    expect(evaluateRule(baseRule, { protein: 200 }).status).toBe('pass');
    expect(evaluateRule(baseRule, { protein: 100 }).status).toBe('fail');
  });
});

function minimalLog(overrides: Partial<DailyLog> = {}): DailyLog {
  return {
    id: 'd1',
    user_id: 'u1',
    log_date: '2026-08-04',
    day_of_week: 'Tuesday',
    training_done: true,
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
    dinner_plates: 1,
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
    full_rom_followed: true,
    last_deload_date: null,
    weekly_weight_lb: null,
    weekly_waist_inches: null,
    notes: null,
    created_at: '2026-08-04T00:00:00Z',
    ...overrides,
  };
}

describe('profile-relative timing rules', () => {
  const eveningProfile: Profile = {
    id: 'u1',
    user_id: 'u1',
    age: 40,
    height_cm: 180,
    weight_lb: 200,
    bodyfat_pct: 20,
    goal_bodyfat_pct: 15,
    goal_weight_lb: 185,
    training_years: 2,
    training_time: '17:00:00',
  };

  it('injects post-gym deadline from profile training time, not a Jason clock', () => {
    const ctx = buildContext(minimalLog(), undefined, eveningProfile);
    // 17:00 train → deadline 18:30 (training + 90)
    expect(ctx.post_gym_deadline).toBe('18:30');
    expect(ctx.pre_gym_target).toBe('16:15');
    expect(ctx.caffeine_cutoff).toBe('14:00');
    expect(ctx.bedtime_window_start).toBe('21:30');
    expect(ctx.bedtime_window_end).toBe('22:30');
  });

  it('passes post-gym for an evening trainee who eats by the shifted deadline', () => {
    const rule = getRuleById('meal_timing_post_gym');
    expect(rule).not.toBeNull();
    const ctx = buildContext(
      minimalLog({ training_done: true, post_gym_meal_time: '18:20:00' }),
      undefined,
      eveningProfile,
    );
    expect(evaluateRule(rule!, ctx).status).toBe('pass');
  });

  it('fails the old Jason 12:30 post-gym rule when the athlete trains at 5pm', () => {
    const rule = getRuleById('meal_timing_post_gym');
    const ctx = buildContext(
      minimalLog({ training_done: true, post_gym_meal_time: '19:00:00' }),
      undefined,
      eveningProfile,
    );
    // 19:00 is after 18:30 deadline — fail under relative rules
    expect(evaluateRule(rule!, ctx).status).toBe('fail');
    // but would have incorrectly passed under hardcoded 12:30 (string compare 19:00 > 12:30 is false for <=)
    // confirming relative path is what runs:
    expect(ctx.post_gym_deadline).not.toBe('12:30');
  });

  it('scores caffeine cutoff from context caffeine_cutoff', () => {
    const rule = getRuleById('caffeine_cutoff');
    const passCtx = buildContext(
      minimalLog({ last_caffeine_time: '13:30:00' }),
      undefined,
      eveningProfile,
    );
    const failCtx = buildContext(
      minimalLog({ last_caffeine_time: '15:00:00' }),
      undefined,
      eveningProfile,
    );
    expect(evaluateRule(rule!, passCtx).status).toBe('pass');
    expect(evaluateRule(rule!, failCtx).status).toBe('fail');
  });
});
