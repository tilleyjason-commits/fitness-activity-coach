import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Supplement taken/untaken writes must go through the transactional
 * set_supplement_taken RPC from migration 013: one round trip, identity from
 * auth.uid(), legacy daily_logs booleans synced server-side — never by the
 * client. List management uses plain RLS-guarded table operations and never
 * seeds defaults on its own.
 */

const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock('~/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
  },
  isSupabaseConfigured: true,
}));

interface BuilderResult {
  data?: unknown;
  error?: { message: string } | null;
}

type Builder = Record<string, ReturnType<typeof vi.fn>> & {
  then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise<unknown>;
};

/** Chainable PostgREST builder stub: every method returns the builder; awaiting it resolves the result. */
function createBuilder(result: BuilderResult = {}): Builder {
  const builder = {} as Builder;
  const methods = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'in', 'not', 'gte', 'lte', 'order', 'limit', 'single', 'maybeSingle',
  ];
  for (const method of methods) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (resolve, reject) =>
    Promise.resolve({ data: null, error: null, ...result }).then(resolve, reject);
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('setSupplementTaken via set_supplement_taken RPC', () => {
  it('sends exactly the RPC payload — no user id, no client-side daily_logs write', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    const { setSupplementTaken } = await import('~/lib/db');

    await setSupplementTaken('supp-1', '2026-07-20', true);

    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [fn, payload] = rpcMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(fn).toBe('set_supplement_taken');
    expect(payload).toEqual({
      p_supplement_id: 'supp-1',
      p_log_date: '2026-07-20',
      p_taken: true,
    });
    // The legacy-boolean bridge lives in SQL only: the client never dual-writes.
    expect(JSON.stringify(payload)).not.toMatch(/user_?id|daily_log|creatine/i);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('sends p_taken false to untoggle', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    const { setSupplementTaken } = await import('~/lib/db');

    await setSupplementTaken('supp-1', '2026-07-20', false);

    const [, payload] = rpcMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.p_taken).toBe(false);
  });

  it('surfaces RPC errors with the function name and no fallback write', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'supplement not found or not owned by caller' },
    });
    const { setSupplementTaken } = await import('~/lib/db');

    await expect(setSupplementTaken('supp-x', '2026-07-20', true)).rejects.toThrow(
      /set_supplement_taken.*not owned/,
    );
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('listSupplements', () => {
  it('selects the user rows ordered active-first, then sort_order, then created_at', async () => {
    const rows = [{ id: 'a', slug: 'creatine', name: 'Creatine', active: true }];
    const builder = createBuilder({ data: rows });
    fromMock.mockReturnValue(builder);
    const { listSupplements } = await import('~/lib/db');

    const result = await listSupplements('user-1');

    expect(fromMock).toHaveBeenCalledWith('user_supplements');
    expect(builder.select).toHaveBeenCalledWith('*');
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(builder.order.mock.calls).toEqual([
      ['active', { ascending: false }],
      ['sort_order', { ascending: true }],
      ['created_at', { ascending: true }],
    ]);
    expect(result).toEqual(rows);
  });

  it('never seeds defaults: an empty list stays empty and triggers no writes', async () => {
    const builder = createBuilder({ data: [] });
    fromMock.mockReturnValue(builder);
    const { listSupplements } = await import('~/lib/db');

    const result = await listSupplements('user-1');

    expect(result).toEqual([]);
    expect(builder.insert).not.toHaveBeenCalled();
    expect(builder.upsert).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('throws on query errors', async () => {
    fromMock.mockReturnValue(createBuilder({ error: { message: 'relation missing' } }));
    const { listSupplements } = await import('~/lib/db');

    await expect(listSupplements('user-1')).rejects.toThrow(/relation missing/);
  });
});

describe('addSupplement', () => {
  it('inserts a built-in with its canonical slug preserved', async () => {
    const row = { id: 'new-1', user_id: 'user-1', slug: 'creatine', name: 'Creatine' };
    const builder = createBuilder({ data: row });
    fromMock.mockReturnValue(builder);
    const { addSupplement } = await import('~/lib/db');

    const result = await addSupplement({ user_id: 'user-1', slug: 'creatine', name: 'Creatine' });

    expect(fromMock).toHaveBeenCalledWith('user_supplements');
    expect(builder.insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      slug: 'creatine',
      name: 'Creatine',
    });
    expect(builder.select).toHaveBeenCalled();
    expect(builder.single).toHaveBeenCalled();
    expect(result).toEqual(row);
  });

  it('omits slug for custom supplements so the database generates one', async () => {
    const builder = createBuilder({ data: { id: 'new-2' } });
    fromMock.mockReturnValue(builder);
    const { addSupplement } = await import('~/lib/db');

    await addSupplement({ user_id: 'user-1', name: 'Ashwagandha' });

    const inserted = builder.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(inserted).not.toHaveProperty('slug');
    expect(inserted.name).toBe('Ashwagandha');
  });

  it('throws on insert errors', async () => {
    fromMock.mockReturnValue(createBuilder({ error: { message: 'duplicate key' } }));
    const { addSupplement } = await import('~/lib/db');

    await expect(addSupplement({ user_id: 'user-1', name: 'X' })).rejects.toThrow(/duplicate key/);
  });
});

describe('updateSupplement', () => {
  it('patches by id and returns the updated row', async () => {
    const row = { id: 'supp-1', active: false };
    const builder = createBuilder({ data: row });
    fromMock.mockReturnValue(builder);
    const { updateSupplement } = await import('~/lib/db');

    const result = await updateSupplement('supp-1', { active: false });

    expect(fromMock).toHaveBeenCalledWith('user_supplements');
    expect(builder.update).toHaveBeenCalledWith({ active: false });
    expect(builder.eq).toHaveBeenCalledWith('id', 'supp-1');
    expect(result).toEqual(row);
  });

  it('throws on update errors', async () => {
    fromMock.mockReturnValue(createBuilder({ error: { message: 'row not found' } }));
    const { updateSupplement } = await import('~/lib/db');

    await expect(updateSupplement('supp-1', { name: 'Y' })).rejects.toThrow(/row not found/);
  });
});

describe('deleteSupplement', () => {
  it('deletes by id', async () => {
    const builder = createBuilder();
    fromMock.mockReturnValue(builder);
    const { deleteSupplement } = await import('~/lib/db');

    await deleteSupplement('supp-1');

    expect(fromMock).toHaveBeenCalledWith('user_supplements');
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('id', 'supp-1');
  });

  it('throws on delete errors', async () => {
    fromMock.mockReturnValue(createBuilder({ error: { message: 'permission denied' } }));
    const { deleteSupplement } = await import('~/lib/db');

    await expect(deleteSupplement('supp-1')).rejects.toThrow(/permission denied/);
  });
});

describe('getSupplementLogs', () => {
  it('selects the user presence rows for one date', async () => {
    const rows = [{ id: 'log-1', supplement_id: 'supp-1', log_date: '2026-07-20' }];
    const builder = createBuilder({ data: rows });
    fromMock.mockReturnValue(builder);
    const { getSupplementLogs } = await import('~/lib/db');

    const result = await getSupplementLogs('user-1', '2026-07-20');

    expect(fromMock).toHaveBeenCalledWith('supplement_logs');
    expect(builder.select).toHaveBeenCalledWith('*');
    expect(builder.eq.mock.calls).toEqual([
      ['user_id', 'user-1'],
      ['log_date', '2026-07-20'],
    ]);
    expect(result).toEqual(rows);
  });

  it('throws on query errors', async () => {
    fromMock.mockReturnValue(createBuilder({ error: { message: 'network down' } }));
    const { getSupplementLogs } = await import('~/lib/db');

    await expect(getSupplementLogs('user-1', '2026-07-20')).rejects.toThrow(/network down/);
  });
});
