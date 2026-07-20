import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_SUPPLEMENTS,
  SUPPLEMENT_RULE_SLUGS,
  UNIT_SUGGESTIONS,
  activeSlugSet,
  doseSummary,
  inapplicableSupplementRuleIds,
  isCanonicalActive,
  isSupplementRuleApplicable,
} from '~/lib/supplements';
import { getAllRules } from '~/lib/evaluate';
import type { UserSupplement } from '~/lib/types';

function makeSupplement(overrides: Partial<UserSupplement> = {}): UserSupplement {
  return {
    id: 'supp-1',
    user_id: 'user-1',
    slug: 'creatine',
    name: 'Creatine',
    dose_amount: null,
    dose_unit: null,
    instructions: null,
    active: true,
    sort_order: 0,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

describe('built-in supplement catalog', () => {
  it('contains exactly the five canonical slugs, unique, names only (no doses)', () => {
    const slugs = BUILT_IN_SUPPLEMENTS.map((s) => s.slug);
    expect(slugs).toEqual(['creatine', 'vitamin-d', 'magnesium', 'omega-3', 'beta-alanine']);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const entry of BUILT_IN_SUPPLEMENTS) {
      expect(entry.name.trim().length).toBeGreaterThan(0);
      // Catalog is names/slugs only — dose recommendations are never hard-coded.
      expect(Object.keys(entry).sort()).toEqual(['name', 'slug']);
    }
  });
});

describe('rule applicability map', () => {
  it('maps exactly the five configurable built-in rules to canonical slugs', () => {
    expect(SUPPLEMENT_RULE_SLUGS).toEqual({
      creatine_daily: 'creatine',
      vitamin_d_daily: 'vitamin-d',
      magnesium_glycinate_bed: 'magnesium',
      omega3_fish_oil: 'omega-3',
      beta_alanine_compliance: 'beta-alanine',
    });
  });

  it('references only rule ids that exist in rules.json', () => {
    const ruleIds = new Set(getAllRules().map((r) => r.id));
    for (const ruleId of Object.keys(SUPPLEMENT_RULE_SLUGS)) {
      expect(ruleIds.has(ruleId)).toBe(true);
    }
  });

  it('leaves caffeine_dose_monitor unaffected even though its domain is supplements', () => {
    expect(SUPPLEMENT_RULE_SLUGS).not.toHaveProperty('caffeine_dose_monitor');
    expect(isSupplementRuleApplicable('caffeine_dose_monitor', new Set())).toBe(true);
  });

  it('gates mapped rules on the active slug set', () => {
    expect(isSupplementRuleApplicable('creatine_daily', new Set())).toBe(false);
    expect(isSupplementRuleApplicable('creatine_daily', new Set(['creatine']))).toBe(true);
    expect(isSupplementRuleApplicable('omega3_fish_oil', new Set(['creatine']))).toBe(false);
  });

  it('never gates non-supplement rules', () => {
    expect(isSupplementRuleApplicable('protein_daily_target', new Set())).toBe(true);
    expect(isSupplementRuleApplicable('evening_casein', new Set())).toBe(true);
  });

  it('returns every inactive configurable rule id directly from the canonical map', () => {
    expect(inapplicableSupplementRuleIds(new Set(['creatine']))).toEqual([
      'vitamin_d_daily',
      'magnesium_glycinate_bed',
      'omega3_fish_oil',
      'beta_alanine_compliance',
    ]);
    expect(inapplicableSupplementRuleIds(new Set())).toEqual(Object.keys(SUPPLEMENT_RULE_SLUGS));
  });
});

describe('activeSlugSet', () => {
  it('collects slugs of active supplements only', () => {
    const set = activeSlugSet([
      makeSupplement({ id: 'a', slug: 'creatine', active: true }),
      makeSupplement({ id: 'b', slug: 'magnesium', active: false }),
      makeSupplement({ id: 'c', slug: 'custom-123', name: 'Ashwagandha', active: true }),
    ]);
    expect(set).toEqual(new Set(['creatine', 'custom-123']));
  });
});

describe('isCanonicalActive', () => {
  it('detects an active canonical creatine row', () => {
    expect(isCanonicalActive([makeSupplement()], 'creatine')).toBe(true);
  });

  it('is false when creatine is deactivated or absent', () => {
    expect(isCanonicalActive([makeSupplement({ active: false })], 'creatine')).toBe(false);
    expect(isCanonicalActive([], 'creatine')).toBe(false);
  });

  it('matches by canonical slug, not by user-visible name', () => {
    const customNamedCreatine = makeSupplement({ slug: 'a1b2-custom', name: 'Creatine' });
    expect(isCanonicalActive([customNamedCreatine], 'creatine')).toBe(false);
  });
});

describe('doseSummary', () => {
  it('combines amount, unit, and instructions', () => {
    expect(
      doseSummary(makeSupplement({ dose_amount: 5, dose_unit: 'g', instructions: 'with breakfast' })),
    ).toBe('5 g — with breakfast');
  });

  it('renders amount + unit alone', () => {
    expect(doseSummary(makeSupplement({ dose_amount: 5, dose_unit: 'g' }))).toBe('5 g');
  });

  it('renders instructions alone', () => {
    expect(doseSummary(makeSupplement({ instructions: 'before bed' }))).toBe('before bed');
  });

  it('renders a bare amount without a unit', () => {
    expect(doseSummary(makeSupplement({ dose_amount: 2 }))).toBe('2');
  });

  it('ignores a unit without an amount and returns empty when nothing is set', () => {
    expect(doseSummary(makeSupplement({ dose_unit: 'g' }))).toBe('');
    expect(doseSummary(makeSupplement())).toBe('');
  });
});

describe('unit suggestions', () => {
  it('offers common units without prescribing any dose', () => {
    expect(UNIT_SUGGESTIONS).toContain('g');
    expect(UNIT_SUGGESTIONS).toContain('mg');
    expect(UNIT_SUGGESTIONS.length).toBeGreaterThanOrEqual(5);
  });
});
