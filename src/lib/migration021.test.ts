import { describe, expect, it } from 'vitest';
import sql from '../../supabase/migrations/021_routine_set_targets.sql?raw';

const flat = sql.replace(/\s+/g, ' ');

describe('migration 021 routine set targets', () => {
  it('adds a jsonb set_targets column without rewriting existing rows', () => {
    expect(flat).toMatch(/ALTER TABLE public\.routine_items ADD COLUMN IF NOT EXISTS set_targets jsonb/i);
    expect(sql).not.toMatch(/UPDATE public\.routine_items/i);
    expect(sql).not.toMatch(/DELETE FROM public\.routine_items/i);
  });

  it('validates optional set_targets before save_routine writes', () => {
    expect(flat).toMatch(/jsonb_typeof\(v_item->'set_targets'\) = 'array'/i);
    expect(flat).toMatch(/jsonb_array_length\(.*set_targets.*\) > 20/i);
    expect(flat).toMatch(/jsonb_typeof\(v_item->'set_targets'\) <> 'null'/i);
    expect(flat.indexOf('validate_routine_payload')).toBeLessThan(flat.indexOf('DELETE FROM routine_items'));
  });

  it('persists set_targets through save_routine and treats JSON null as SQL NULL', () => {
    expect(flat).toMatch(/INSERT INTO routine_items[\s\S]*set_targets/i);
    expect(flat).toMatch(/CASE WHEN jsonb_typeof\(t\.i->'set_targets'\) = 'array'/i);
  });

  it('keeps save_routine authenticated and invoker-rights', () => {
    expect(sql).not.toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SECURITY INVOKER/);
    expect(flat).toMatch(/GRANT EXECUTE ON FUNCTION public\.save_routine.*TO authenticated/);
    expect(flat).toMatch(/REVOKE ALL ON FUNCTION public\.save_routine.*FROM PUBLIC, anon/);
  });
});
