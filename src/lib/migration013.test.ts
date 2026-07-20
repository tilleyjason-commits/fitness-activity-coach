import { describe, expect, it } from 'vitest';
// Vite ?raw import keeps this test free of node-only APIs (no @types/node here).
import sql from '../../supabase/migrations/013_user_supplements.sql?raw';

/**
 * Static contract checks for supabase/migrations/013_user_supplements.sql.
 * The migration cannot run in unit tests, so these assertions pin the security
 * and data-preservation guarantees the SPEC requires: structural ownership,
 * RLS, the migration-011 RPC conventions, the fixed legacy-boolean whitelist,
 * idempotent backfill, and no forced default seeding.
 */

/** Whitespace-collapsed for multi-line pattern matching. */
const flat = sql.replace(/\s+/g, ' ');

describe('tables and structural ownership', () => {
  it('creates both additive tables idempotently', () => {
    expect(flat).toMatch(/CREATE TABLE IF NOT EXISTS user_supplements/);
    expect(flat).toMatch(/CREATE TABLE IF NOT EXISTS supplement_logs/);
  });

  it('keeps per-user slug uniqueness for canonical built-ins', () => {
    expect(flat).toMatch(/UNIQUE \(user_id, slug\)/);
  });

  it('enforces parent ownership structurally with a composite foreign key', () => {
    expect(flat).toMatch(/UNIQUE \(id, user_id\)/);
    expect(flat).toMatch(
      /FOREIGN KEY \(supplement_id, user_id\) REFERENCES user_supplements \(id, user_id\) ON DELETE CASCADE/,
    );
  });

  it('makes presence rows idempotent per supplement and day', () => {
    expect(flat).toMatch(/UNIQUE \(supplement_id, log_date\)/);
  });

  it('never suggests doses: dose fields are optional and only constrained to be positive', () => {
    expect(flat).toMatch(/dose_amount numeric CHECK \(dose_amount IS NULL OR dose_amount > 0\)/);
    expect(sql).not.toMatch(/DEFAULT\s+5/);
  });
});

describe('row level security', () => {
  it('enables RLS on both tables', () => {
    expect(flat).toMatch(/ALTER TABLE user_supplements ENABLE ROW LEVEL SECURITY/);
    expect(flat).toMatch(/ALTER TABLE supplement_logs ENABLE ROW LEVEL SECURITY/);
  });

  it('scopes both tables to auth.uid() and keeps the child parent-ownership check', () => {
    const policies = flat.match(/CREATE POLICY[\s\S]*?;/g) ?? [];
    expect(policies.length).toBeGreaterThanOrEqual(2);
    for (const policy of policies) {
      expect(policy).toMatch(/user_id = auth\.uid\(\)/);
    }
    // Child WITH CHECK must verify the referenced supplement belongs to the caller
    // (kept in addition to the composite FK).
    expect(flat).toMatch(
      /EXISTS \( SELECT 1 FROM user_supplements s WHERE s\.id = supplement_logs\.supplement_id AND s\.user_id = auth\.uid\(\) \)/,
    );
  });
});

describe('set_supplement_taken RPC (migration 011 conventions)', () => {
  it('exists with the expected signature', () => {
    expect(flat).toMatch(
      /CREATE OR REPLACE FUNCTION public\.set_supplement_taken\( p_supplement_id uuid, p_log_date date, p_taken boolean \)/,
    );
  });

  it('is SECURITY INVOKER with a pinned search_path and auth.uid() identity', () => {
    expect(flat).toMatch(/SECURITY INVOKER/);
    expect(flat).toMatch(/SET search_path = public/);
    expect(flat).toMatch(/auth\.uid\(\)/);
    expect(sql).not.toMatch(/SECURITY DEFINER/);
  });

  it('verifies supplement ownership explicitly', () => {
    expect(flat).toMatch(/WHERE id = p_supplement_id AND user_id = v_user/);
    expect(flat).toMatch(/not owned by caller/);
  });

  it('inserts and deletes the presence row idempotently', () => {
    expect(flat).toMatch(/ON CONFLICT \(supplement_id, log_date\) DO NOTHING/);
    expect(flat).toMatch(/DELETE FROM supplement_logs WHERE supplement_id = p_supplement_id/);
  });

  it('bridges exactly the five canonical slugs to legacy booleans via a fixed whitelist', () => {
    expect(flat).toMatch(/WHEN 'creatine' THEN 'creatine_taken'/);
    expect(flat).toMatch(/WHEN 'vitamin-d' THEN 'vitamin_d_taken'/);
    expect(flat).toMatch(/WHEN 'magnesium' THEN 'magnesium_taken'/);
    expect(flat).toMatch(/WHEN 'omega-3' THEN 'omega3_taken'/);
    expect(flat).toMatch(/WHEN 'beta-alanine' THEN 'beta_alanine_taken'/);
    // Dynamic SQL identifiers only ever come from format('%I') over that whitelist.
    expect(flat).toMatch(/%I/);
    // Custom slugs (v_column NULL) skip the legacy write entirely.
    expect(flat).toMatch(/IF v_column IS NOT NULL THEN/);
  });

  it('validates every RPC parameter before any write', () => {
    expect(flat).toMatch(/p_supplement_id IS NULL/);
    expect(flat).toMatch(/p_log_date IS NULL/);
    expect(flat).toMatch(/p_taken IS NULL/);
  });

  it('is revoked from PUBLIC and anon, granted to authenticated only', () => {
    expect(flat).toMatch(
      /REVOKE ALL ON FUNCTION public\.set_supplement_taken\(uuid, date, boolean\) FROM PUBLIC, anon/,
    );
    expect(flat).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.set_supplement_taken\(uuid, date, boolean\) TO authenticated/,
    );
  });
});

describe('legacy backfill (preserve existing check-ins)', () => {
  it('creates canonical rows only for users with at least one true legacy boolean', () => {
    // Exactly one INSERT into user_supplements, sourced from daily_logs trues.
    const inserts = flat.match(/INSERT INTO user_supplements/g) ?? [];
    expect(inserts).toHaveLength(1);
    expect(flat).toMatch(/INSERT INTO user_supplements[\s\S]*?FROM daily_logs/);
    for (const column of [
      'creatine_taken',
      'vitamin_d_taken',
      'magnesium_taken',
      'omega3_taken',
      'beta_alanine_taken',
    ]) {
      expect(flat).toContain(column);
    }
    expect(flat).toMatch(/ON CONFLICT \(user_id, slug\) DO NOTHING/);
  });

  it('backfills presence rows for every historical true date, idempotently', () => {
    expect(flat).toMatch(
      /INSERT INTO supplement_logs \(user_id, supplement_id, log_date\)[\s\S]*?FROM daily_logs/,
    );
  });

  it('never modifies or deletes legacy daily_logs values', () => {
    expect(sql).not.toMatch(/DELETE FROM daily_logs/);
    expect(sql).not.toMatch(/ALTER TABLE daily_logs/);
    expect(sql).not.toMatch(/DROP TABLE|DROP COLUMN/i);
    // The only daily_logs write is the RPC's whitelisted upsert (dynamic %I form).
    const directWrites = sql.match(/UPDATE daily_logs|INSERT INTO daily_logs/g) ?? [];
    expect(directWrites).toHaveLength(1);
    expect(flat).toMatch(/'INSERT INTO daily_logs \(user_id, log_date, day_of_week, %I\)/);
  });
});
