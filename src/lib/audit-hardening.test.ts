import { describe, expect, it } from 'vitest';
import { PHOTO_MAX_BYTES, validatePhotoFile } from './plan-repo';
import { getAllRules, ruleAppliesToProfile } from './evaluate';
import type { Profile } from './types';
import { buildCsp, inlineScriptHashes } from '../../scripts/csp.mjs';

const profile = (flags?: string[]): Profile => ({
  id: 'u', user_id: 'u', age: null, height_cm: null, weight_lb: null, bodyfat_pct: null,
  goal_bodyfat_pct: null, goal_weight_lb: null, training_years: null, training_time: null,
  coaching_flags: flags,
});

describe('validatePhotoFile', () => {
  it('accepts allowed image types within the limit', () => {
    expect(validatePhotoFile({ type: 'image/png', size: 1000 })).toBeNull();
    expect(validatePhotoFile({ type: 'image/webp', size: PHOTO_MAX_BYTES })).toBeNull();
  });
  it('rejects other types and oversized files', () => {
    expect(validatePhotoFile({ type: 'application/pdf', size: 10 })).toMatch(/JPEG, PNG, or WebP/);
    expect(validatePhotoFile({ type: 'image/gif', size: 10 })).not.toBeNull();
    expect(validatePhotoFile({ type: 'image/jpeg', size: PHOTO_MAX_BYTES + 1 })).toMatch(/too large/);
  });
});

describe('per-profile coaching rules', () => {
  const knee = () => getAllRules().find((r) => r.id === 'knee_safe_exercises')!;
  it('gates joint rules behind an opt-in flag', () => {
    expect(knee().requires_flag).toBe('knee_limited');
    expect(ruleAppliesToProfile(knee(), profile())).toBe(false);
    expect(ruleAppliesToProfile(knee(), null)).toBe(false);
    expect(ruleAppliesToProfile(knee(), profile(['shoulder_limited']))).toBe(false);
    expect(ruleAppliesToProfile(knee(), profile(['knee_limited']))).toBe(true);
  });
  it('leaves ungated rules universal', () => {
    const protein = getAllRules().find((r) => r.id === 'protein_daily_target')!;
    expect(ruleAppliesToProfile(protein, null)).toBe(true);
  });
  it('no rule text names a specific person', () => {
    expect(JSON.stringify(getAllRules())).not.toMatch(/Jason/);
  });
});

describe('content security policy', () => {
  it('has no unsafe-inline for scripts and allows hashed inline scripts', () => {
    const hashes = inlineScriptHashes('<script>var a=1;</script><script src="x.js"></script>');
    expect(hashes).toHaveLength(1);
    const csp = buildCsp({ scriptHashes: hashes });
    expect(csp).toMatch(/script-src 'self' 'sha256-/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain('frame-ancestors');
    expect(buildCsp({ header: true })).toContain("frame-ancestors 'none'");
  });
});
