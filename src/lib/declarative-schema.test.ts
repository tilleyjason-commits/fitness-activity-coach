import { describe, expect, it } from 'vitest';
import finalCheckedMigration from '../../supabase/migrations/014_expand_meal_slots.sql?raw';
import baseline from '../../supabase/schemas/001_core_baseline.sql?raw';

describe('local declarative schema baseline', () => {
  it.each(['profiles', 'daily_logs', 'exercise_logs', 'weekly_summaries', 'recommendations'])(
    'defines the missing pre-migration table %s',
    (table) => {
      expect(baseline).toMatch(new RegExp(`CREATE TABLE public\\.${table}\\s*\\(`, 'i'));
    },
  );

  it('provides the natural keys required by later upserts', () => {
    expect(baseline).toMatch(/UNIQUE\s*\(user_id,\s*log_date\)/i);
    expect(baseline).toMatch(/UNIQUE\s*\(user_id,\s*week_start\)/i);
  });

  it('does not widen roles or duplicate migration-owned security objects', () => {
    expect(baseline).not.toMatch(/\bGRANT\b/i);
    expect(baseline).not.toMatch(/\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b/i);
    expect(baseline).not.toMatch(/\bCREATE\s+POLICY\b/i);
  });

  it('keeps later schema evolution in numbered migrations', () => {
    expect(finalCheckedMigration).toMatch(/ALTER TABLE public\.meal_logs/i);
    expect(baseline).not.toMatch(/CREATE TABLE public\.meal_logs/i);
  });
});
