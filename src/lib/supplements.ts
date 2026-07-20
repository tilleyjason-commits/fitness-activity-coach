import type { UserSupplement } from './types';

/**
 * Built-in supplement catalog and rule-applicability helpers.
 *
 * The catalog carries names/slugs only — the app never suggests doses; dose,
 * unit, and instructions are optional user-entered values. Built-in quick-add
 * must use these canonical slugs so the SQL legacy bridge in
 * set_supplement_taken (migration 013) and the applicability map below work.
 */

export interface BuiltInSupplement {
  slug: string;
  name: string;
}

export const BUILT_IN_SUPPLEMENTS: readonly BuiltInSupplement[] = [
  { slug: 'creatine', name: 'Creatine' },
  { slug: 'vitamin-d', name: 'Vitamin D' },
  { slug: 'magnesium', name: 'Magnesium' },
  { slug: 'omega-3', name: 'Omega-3' },
  { slug: 'beta-alanine', name: 'Beta-Alanine' },
];

/**
 * Explicit rule-id → canonical-slug map for the five configurable built-in
 * rules. Applicability is decided by these ids only — never inferred from
 * user-visible names. caffeine_dose_monitor is deliberately absent: it stays
 * applicable regardless of the supplement list even though its rules domain
 * is 'supplements'.
 */
export const SUPPLEMENT_RULE_SLUGS: Record<string, string> = {
  creatine_daily: 'creatine',
  vitamin_d_daily: 'vitamin-d',
  magnesium_glycinate_bed: 'magnesium',
  omega3_fish_oil: 'omega-3',
  beta_alanine_compliance: 'beta-alanine',
};

/** A rule applies unless it is mapped to a built-in slug the user has not activated. */
export function isSupplementRuleApplicable(
  ruleId: string,
  activeSlugs: ReadonlySet<string>,
): boolean {
  const slug = SUPPLEMENT_RULE_SLUGS[ruleId];
  return slug === undefined || activeSlugs.has(slug);
}

/** Every configurable supplement rule whose canonical supplement is inactive. */
export function inapplicableSupplementRuleIds(activeSlugs: ReadonlySet<string>): string[] {
  return Object.entries(SUPPLEMENT_RULE_SLUGS)
    .filter(([, slug]) => !activeSlugs.has(slug))
    .map(([ruleId]) => ruleId);
}

/** Slugs of the active supplements in a list. */
export function activeSlugSet(supplements: readonly UserSupplement[]): Set<string> {
  return new Set(supplements.filter((s) => s.active).map((s) => s.slug));
}

/** True when the canonical built-in slug is present and active (slug match, not name). */
export function isCanonicalActive(
  supplements: readonly UserSupplement[],
  slug: string,
): boolean {
  return supplements.some((s) => s.slug === slug && s.active);
}

/** Unit suggestions for the editor's datalist — suggestions only, free entry allowed. */
export const UNIT_SUGGESTIONS: readonly string[] = [
  'g', 'mg', 'µg', 'IU', 'ml', 'capsule', 'tablet', 'scoop', 'drop',
];

/**
 * Human summary of the user-entered dose fields, e.g. "5 g — with breakfast".
 * Empty string when nothing meaningful is set (a unit without an amount is
 * not rendered).
 */
export function doseSummary(
  s: Pick<UserSupplement, 'dose_amount' | 'dose_unit' | 'instructions'>,
): string {
  const parts: string[] = [];
  if (s.dose_amount !== null) {
    parts.push(s.dose_unit ? `${s.dose_amount} ${s.dose_unit}` : `${s.dose_amount}`);
  }
  if (s.instructions?.trim()) {
    parts.push(s.instructions.trim());
  }
  return parts.join(' — ');
}

/** Mirrors the list query ordering: active first, then sort_order, then created_at. */
export function compareSupplements(a: UserSupplement, b: UserSupplement): number {
  if (a.active !== b.active) return a.active ? -1 : 1;
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return a.created_at.localeCompare(b.created_at);
}
