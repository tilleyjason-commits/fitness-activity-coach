import { describe, expect, it } from 'vitest';
// Vite ?raw import keeps this test free of node-only APIs (no @types/node here).
import sql from '../../supabase/migrations/014_expand_meal_slots.sql?raw';

/**
 * Static contract checks for supabase/migrations/014_expand_meal_slots.sql.
 * The migration must only swap the meal_slot CHECK constraint (dropped by its
 * exact PostgreSQL-generated name from migration 003, failing closed if schema
 * history differs) — no data changes, no table/RPC/RLS rewrites, no dynamic
 * catalog scans.
 */

/** Whitespace-collapsed for multi-line pattern matching. */
const flat = sql.replace(/\s+/g, ' ');

describe('constraint swap', () => {
  it('drops the old constraint by its exact name, failing closed if absent', () => {
    expect(flat).toMatch(
      /ALTER TABLE public\.meal_logs DROP CONSTRAINT meal_logs_meal_slot_check;/,
    );
    // No IF EXISTS: a missing constraint means schema history diverged.
    expect(sql).not.toMatch(/IF EXISTS/i);
  });

  it('recreates the constraint with all seven canonical identifiers', () => {
    const add = flat.match(
      /ALTER TABLE public\.meal_logs ADD CONSTRAINT meal_logs_meal_slot_check CHECK \(meal_slot IN \(([^)]*)\)\)/,
    );
    expect(add).not.toBeNull();
    for (const slot of [
      'breakfast',
      'lunch',
      'dinner',
      'post_gym',
      'snack',
      'pre_workout_snack',
      'bedtime_snack',
    ]) {
      expect(add![1]).toContain(`'${slot}'`);
    }
  });

  it('documents the constraint', () => {
    expect(flat).toMatch(/COMMENT ON CONSTRAINT meal_logs_meal_slot_check ON public\.meal_logs/);
  });
});

describe('blast radius', () => {
  it('does not drop or rewrite tables, uniqueness, RLS, or functions', () => {
    expect(sql).not.toMatch(/DROP TABLE|DROP POLICY|DROP FUNCTION|DROP INDEX/i);
    expect(sql).not.toMatch(/CREATE TABLE|CREATE POLICY|CREATE INDEX/i);
    expect(sql).not.toMatch(/CREATE (OR REPLACE )?FUNCTION/i);
    expect(sql).not.toMatch(/UNIQUE/i);
    // Exactly one DROP CONSTRAINT / ADD CONSTRAINT pair.
    expect(sql.match(/DROP CONSTRAINT/g)).toHaveLength(1);
    expect(sql.match(/ADD CONSTRAINT/g)).toHaveLength(1);
  });

  it('never touches application data', () => {
    expect(sql).not.toMatch(/UPDATE |DELETE FROM|INSERT INTO|TRUNCATE/i);
  });

  it('has no broad catalog loop or dynamic DROP', () => {
    expect(sql).not.toMatch(/pg_constraint|pg_catalog|information_schema/i);
    expect(sql).not.toMatch(/EXECUTE|format\s*\(|DO \$\$/i);
  });
});
