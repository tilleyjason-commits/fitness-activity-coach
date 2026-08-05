import { describe, expect, it } from 'vitest';
import sql from '../../supabase/migrations/020_rpc_input_bounds.sql?raw';

const flat = sql.replace(/\s+/g, ' ');

describe('migration 020 RPC input bounds', () => {
  it('validates before workout and routine writes', () => {
    expect(flat).toMatch(/PERFORM public\.validate_workout_payload\(p_exercises, p_cardio\)/);
    expect(flat).toMatch(/PERFORM public\.validate_routine_payload\(p_name, p_items\)/);
    expect(flat.indexOf('validate_workout_payload(p_exercises, p_cardio)')).toBeLessThan(
      flat.indexOf('DELETE FROM workout_exercises'),
    );
    expect(flat.indexOf('validate_routine_payload(p_name, p_items)')).toBeLessThan(
      flat.indexOf('DELETE FROM routine_items'),
    );
  });

  it('caps aggregate cardinality and numeric ranges', () => {
    expect(flat).toContain('at most 100 items');
    expect(flat).toContain('at most 25 items');
    expect(flat).toContain('at most 20 items');
    expect(flat).toMatch(/target_weight.*BETWEEN 0 AND 2000/i);
    expect(flat).toMatch(/duration_minutes.*BETWEEN 0 AND 1440/i);
    expect(flat).toMatch(/distance_miles.*BETWEEN 0 AND 1000/i);
  });

  it('adds constraints without rewriting or rejecting historical rows', () => {
    expect(sql.match(/NOT VALID/g)?.length).toBeGreaterThanOrEqual(5);
    const constraintSection = sql.slice(
      sql.indexOf('ALTER TABLE public.workout_exercises'),
      sql.indexOf('-- Recreate save_workout'),
    );
    expect(constraintSection).not.toMatch(/VALIDATE CONSTRAINT|UPDATE |DELETE FROM|INSERT INTO/i);
  });

  it('keeps all helpers and RPCs authenticated and invoker-rights', () => {
    expect(sql).not.toMatch(/SECURITY DEFINER/);
    expect(sql.match(/SECURITY INVOKER/g)).toHaveLength(4);
    expect(flat).toMatch(/REVOKE ALL ON FUNCTION public\.validate_workout_payload.*FROM PUBLIC, anon/);
    expect(flat).toMatch(/GRANT EXECUTE ON FUNCTION public\.save_workout.*TO authenticated/);
  });
});
