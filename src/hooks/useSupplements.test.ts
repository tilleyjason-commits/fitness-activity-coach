import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { UserSupplement } from '~/lib/types';

const db = {
  listSupplements: vi.fn(),
  addSupplement: vi.fn(),
  updateSupplement: vi.fn(),
  deleteSupplement: vi.fn(),
};
vi.mock('~/lib/db', () => ({
  listSupplements: (...a: unknown[]) => db.listSupplements(...a),
  addSupplement: (...a: unknown[]) => db.addSupplement(...a),
  updateSupplement: (...a: unknown[]) => db.updateSupplement(...a),
  deleteSupplement: (...a: unknown[]) => db.deleteSupplement(...a),
}));

const AUTH_VALUE = {
  user: { id: 'user-1' },
  session: null,
  loading: false,
  signIn: async () => null,
  signUp: async () => null,
  signOut: async () => {},
};
vi.mock('~/context/AuthContext', () => ({
  useAuth: () => AUTH_VALUE,
}));

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

beforeEach(() => {
  vi.clearAllMocks();
  db.listSupplements.mockResolvedValue([]);
});

describe('useSupplements', () => {
  it('loads the current user list', async () => {
    const rows = [makeSupplement()];
    db.listSupplements.mockResolvedValue(rows);
    const { useSupplements } = await import('~/hooks/useSupplements');

    const { result } = renderHook(() => useSupplements());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(db.listSupplements).toHaveBeenCalledWith('user-1');
    expect(result.current.supplements).toEqual(rows);
    expect(result.current.error).toBeNull();
  });

  it('never seeds defaults when the list is empty', async () => {
    const { useSupplements } = await import('~/hooks/useSupplements');

    const { result } = renderHook(() => useSupplements());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.supplements).toEqual([]);
    expect(db.addSupplement).not.toHaveBeenCalled();
    expect(db.updateSupplement).not.toHaveBeenCalled();
    // One read, no retries that could mask writes.
    expect(db.listSupplements).toHaveBeenCalledTimes(1);
  });

  it('surfaces load errors', async () => {
    db.listSupplements.mockRejectedValue(new Error('relation missing'));
    const { useSupplements } = await import('~/hooks/useSupplements');

    const { result } = renderHook(() => useSupplements());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toMatch(/relation missing/);
    expect(result.current.supplements).toEqual([]);
  });

  it('add attaches the current user id and inserts the row into sorted position', async () => {
    const active = makeSupplement({ id: 'a', slug: 'creatine', created_at: '2026-07-01T00:00:00Z' });
    const inactive = makeSupplement({
      id: 'b', slug: 'magnesium', name: 'Magnesium', active: false,
    });
    db.listSupplements.mockResolvedValue([active, inactive]);
    const added = makeSupplement({
      id: 'c', slug: 'omega-3', name: 'Omega-3', created_at: '2026-07-20T00:00:00Z',
    });
    db.addSupplement.mockResolvedValue(added);
    const { useSupplements } = await import('~/hooks/useSupplements');

    const { result } = renderHook(() => useSupplements());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.add({ slug: 'omega-3', name: 'Omega-3' });
    });

    expect(db.addSupplement).toHaveBeenCalledWith({
      user_id: 'user-1',
      slug: 'omega-3',
      name: 'Omega-3',
    });
    // Active rows stay ahead of inactive ones.
    expect(result.current.supplements.map((s) => s.id)).toEqual(['a', 'c', 'b']);
  });

  it('update replaces the row in place', async () => {
    const row = makeSupplement();
    db.listSupplements.mockResolvedValue([row]);
    db.updateSupplement.mockResolvedValue({ ...row, dose_amount: 5, dose_unit: 'g' });
    const { useSupplements } = await import('~/hooks/useSupplements');

    const { result } = renderHook(() => useSupplements());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.update('supp-1', { dose_amount: 5, dose_unit: 'g' });
    });

    expect(db.updateSupplement).toHaveBeenCalledWith('supp-1', { dose_amount: 5, dose_unit: 'g' });
    expect(result.current.supplements[0].dose_amount).toBe(5);
  });

  it('remove deletes the row', async () => {
    db.listSupplements.mockResolvedValue([makeSupplement()]);
    db.deleteSupplement.mockResolvedValue(undefined);
    const { useSupplements } = await import('~/hooks/useSupplements');

    const { result } = renderHook(() => useSupplements());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.remove('supp-1');
    });

    expect(db.deleteSupplement).toHaveBeenCalledWith('supp-1');
    expect(result.current.supplements).toEqual([]);
  });

  it('mutation failures propagate to the caller and leave the list unchanged', async () => {
    const row = makeSupplement();
    db.listSupplements.mockResolvedValue([row]);
    db.addSupplement.mockRejectedValue(new Error('duplicate key'));
    const { useSupplements } = await import('~/hooks/useSupplements');

    const { result } = renderHook(() => useSupplements());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      act(() => result.current.add({ slug: 'creatine', name: 'Creatine' })),
    ).rejects.toThrow(/duplicate key/);
    expect(result.current.supplements).toEqual([row]);
  });
});
