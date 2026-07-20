import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const db = {
  getSupplementLogs: vi.fn(),
  setSupplementTaken: vi.fn(),
};
vi.mock('~/lib/db', () => ({
  getSupplementLogs: (...a: unknown[]) => db.getSupplementLogs(...a),
  setSupplementTaken: (...a: unknown[]) => db.setSupplementTaken(...a),
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

function logRow(supplementId: string) {
  return {
    id: `log-${supplementId}`,
    user_id: 'user-1',
    supplement_id: supplementId,
    log_date: '2026-07-19',
    created_at: '2026-07-19T00:00:00Z',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.getSupplementLogs.mockResolvedValue([]);
  db.setSupplementTaken.mockResolvedValue(undefined);
});

describe('useSupplementDay', () => {
  it('loads the taken set for the date', async () => {
    db.getSupplementLogs.mockResolvedValue([logRow('s1')]);
    const { useSupplementDay } = await import('~/hooks/useSupplementDay');

    const { result } = renderHook(() => useSupplementDay('2026-07-19'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(db.getSupplementLogs).toHaveBeenCalledWith('user-1', '2026-07-19');
    expect(result.current.takenIds).toEqual(new Set(['s1']));
    expect(result.current.error).toBeNull();
  });

  it('surfaces load errors', async () => {
    db.getSupplementLogs.mockRejectedValue(new Error('network down'));
    const { useSupplementDay } = await import('~/hooks/useSupplementDay');

    const { result } = renderHook(() => useSupplementDay('2026-07-19'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toMatch(/network down/);
  });

  it('toggle saves through the RPC wrapper and keeps the optimistic state on success', async () => {
    const { useSupplementDay } = await import('~/hooks/useSupplementDay');

    const { result } = renderHook(() => useSupplementDay('2026-07-19'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let ok = false;
    await act(async () => {
      ok = await result.current.toggle('s2', true);
    });

    expect(ok).toBe(true);
    expect(db.setSupplementTaken).toHaveBeenCalledWith('s2', '2026-07-19', true);
    expect(result.current.takenIds.has('s2')).toBe(true);
    expect(result.current.errors.size).toBe(0);
  });

  it('marks the item as saving while the RPC is in flight', async () => {
    let release!: () => void;
    db.setSupplementTaken.mockImplementation(
      () => new Promise<void>((resolve) => { release = resolve; }),
    );
    const { useSupplementDay } = await import('~/hooks/useSupplementDay');

    const { result } = renderHook(() => useSupplementDay('2026-07-19'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.toggle('s2', true);
    });
    expect(result.current.savingIds.has('s2')).toBe(true);

    await act(async () => {
      release();
      await pending;
    });
    expect(result.current.savingIds.has('s2')).toBe(false);
  });

  it('reverts the optimistic state and records a retryable item error on failure', async () => {
    db.setSupplementTaken.mockRejectedValue(new Error('save failed'));
    const { useSupplementDay } = await import('~/hooks/useSupplementDay');

    const { result } = renderHook(() => useSupplementDay('2026-07-19'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let ok = true;
    await act(async () => {
      ok = await result.current.toggle('s2', true);
    });

    expect(ok).toBe(false);
    expect(result.current.takenIds.has('s2')).toBe(false);
    expect(result.current.errors.get('s2')).toEqual({
      taken: true,
      message: expect.stringMatching(/save failed/),
    });
  });

  it('reverts an untoggle failure back to taken', async () => {
    db.getSupplementLogs.mockResolvedValue([logRow('s1')]);
    db.setSupplementTaken.mockRejectedValue(new Error('save failed'));
    const { useSupplementDay } = await import('~/hooks/useSupplementDay');

    const { result } = renderHook(() => useSupplementDay('2026-07-19'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.toggle('s1', false);
    });

    expect(result.current.takenIds.has('s1')).toBe(true);
    expect(result.current.errors.get('s1')).toEqual({
      taken: false,
      message: expect.stringMatching(/save failed/),
    });
  });

  it('does not leak a stale save failure into a newly selected date', async () => {
    let rejectOldSave!: (error: Error) => void;
    db.setSupplementTaken.mockImplementation(
      () => new Promise<void>((_resolve, reject) => { rejectOldSave = reject; }),
    );
    db.getSupplementLogs.mockImplementation(async (_userId: string, date: string) =>
      date === '2026-07-20' ? [logRow('new-day-supplement')] : [],
    );
    const { useSupplementDay } = await import('~/hooks/useSupplementDay');

    const { result, rerender } = renderHook(
      ({ date }) => useSupplementDay(date),
      { initialProps: { date: '2026-07-19' } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.toggle('old-day-supplement', true);
    });
    rerender({ date: '2026-07-20' });
    await waitFor(() => expect(result.current.takenIds.has('new-day-supplement')).toBe(true));

    await act(async () => {
      rejectOldSave(new Error('late old-day failure'));
      await pending;
    });

    expect(result.current.takenIds).toEqual(new Set(['new-day-supplement']));
    expect(result.current.errors.size).toBe(0);
  });

  it('a successful retry clears the item error', async () => {
    db.setSupplementTaken.mockRejectedValueOnce(new Error('save failed'));
    const { useSupplementDay } = await import('~/hooks/useSupplementDay');

    const { result } = renderHook(() => useSupplementDay('2026-07-19'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.toggle('s2', true);
    });
    expect(result.current.errors.has('s2')).toBe(true);

    await act(async () => {
      await result.current.toggle('s2', true);
    });
    expect(result.current.errors.has('s2')).toBe(false);
    expect(result.current.takenIds.has('s2')).toBe(true);
  });
});
