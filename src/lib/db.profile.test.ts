import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression: profiles.user_id is NOT NULL in the live schema, but the app's
 * upsert payload historically sent only `id`, so inserting a brand-new profile
 * returned HTTP 400. The ownership contract is id = user_id = auth.uid().
 */

const upsertMock = vi.fn();
const fromMock = vi.fn();

vi.mock('~/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
  isSupabaseConfigured: true,
}));

function mockUpsertChain(result: { data: unknown; error: { message: string } | null }) {
  fromMock.mockReturnValue({
    upsert: upsertMock.mockReturnValue({
      select: () => ({ single: () => Promise.resolve(result) }),
    }),
  });
}

describe('upsertProfile ownership payload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends both id and user_id set to the authenticated user id', async () => {
    const { upsertProfile } = await import('~/lib/db');
    const userId = '11111111-2222-3333-4444-555555555555';
    mockUpsertChain({
      data: { id: userId, user_id: userId, age: 40 },
      error: null,
    });

    await upsertProfile({
      id: userId,
      user_id: userId,
      age: 40,
      height_cm: 180,
      weight_lb: 210,
      bodyfat_pct: 24,
      goal_bodyfat_pct: 15,
      goal_weight_lb: 190,
      training_years: 2,
      training_time: 'Morning',
    });

    expect(fromMock).toHaveBeenCalledWith('profiles');
    const [payload, options] = upsertMock.mock.calls[0] as [Record<string, unknown>, unknown];
    expect(payload.id).toBe(userId);
    // The old payload omitted user_id entirely → NOT NULL violation (HTTP 400).
    expect(payload.user_id).toBe(userId);
    expect(options).toEqual({ onConflict: 'id' });
  });

  it('propagates a schema error as a thrown Error', async () => {
    const { upsertProfile } = await import('~/lib/db');
    const userId = '11111111-2222-3333-4444-555555555555';
    mockUpsertChain({
      data: null,
      error: { message: 'null value in column "user_id" violates not-null constraint' },
    });

    await expect(
      upsertProfile({
        id: userId,
        user_id: userId,
        age: null,
        height_cm: null,
        weight_lb: null,
        bodyfat_pct: null,
        goal_bodyfat_pct: null,
        goal_weight_lb: null,
        training_years: null,
        training_time: null,
      }),
    ).rejects.toThrow(/user_id/);
  });
});
