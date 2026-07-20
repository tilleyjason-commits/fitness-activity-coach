import { describe, expect, it, vi } from 'vitest';
import {
  evaluateRule,
  isCaffeineBeforeCutoff,
  referencedFields,
  runExpression,
  type Rule,
} from './evaluate';

// These regression tests cover the rule engine's public pure behavior. They do
// not execute untrusted rule text; rules are bundled application assets.
describe('evaluate rule helpers', () => {
  it('supports the documented AND/OR/NOT expression DSL', () => {
    expect(runExpression('protein >= 195 AND NOT skipped', { protein: 200, skipped: false })).toBe(true);
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
