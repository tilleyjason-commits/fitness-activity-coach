import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Rule, RuleResult } from '~/lib/evaluate';
import type { Recommendation } from '~/lib/types';

/**
 * Recommendation applicability reconciliation (SPEC correction 3):
 *  - rules for deactivated built-in supplements must stop displaying;
 *  - reactivating a supplement whose rule fails must be able to resurface the
 *    recommendation (the disable transition must not dismiss it forever);
 *  - manual user dismissals of failing rules are still respected.
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

function createBuilder(result: BuilderResult = {}): Builder {
  const builder = {} as Builder;
  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'in', 'gte', 'lte', 'order']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (resolve, reject) =>
    Promise.resolve({ data: null, error: null, ...result }).then(resolve, reject);
  return builder;
}

/** Queue builders so each supabase.from() call gets the next canned result. */
function queueBuilders(...builders: Builder[]): void {
  let i = 0;
  fromMock.mockImplementation(() => {
    const builder = builders[Math.min(i, builders.length - 1)];
    i += 1;
    return builder;
  });
}

function makeRule(id: string): Rule {
  return {
    id,
    domain: 'supplements',
    description: id,
    trigger: 'log.day.complete',
    evaluate: 'true',
    pass: 'ok',
    fail: 'missed',
    severity: 'medium',
  };
}

function makeRec(overrides: Partial<Recommendation>): Recommendation {
  return {
    id: 'rec-1',
    user_id: 'user-1',
    log_date: '2026-07-20',
    rule_id: 'creatine_daily',
    message: 'Creatine MISSED.',
    severity: 'medium',
    passed: false,
    dismissed: false,
    created_at: '2026-07-20T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('reconcileInapplicableRecommendations', () => {
  it('hides existing rows for the given rule ids by marking them passed + dismissed', async () => {
    const builder = createBuilder();
    fromMock.mockReturnValue(builder);
    const { reconcileInapplicableRecommendations } = await import('~/lib/db');

    await reconcileInapplicableRecommendations('user-1', '2026-07-20', [
      'creatine_daily',
      'omega3_fish_oil',
    ]);

    expect(fromMock).toHaveBeenCalledWith('recommendations');
    expect(builder.update).toHaveBeenCalledWith({ passed: true, dismissed: true });
    expect(builder.eq.mock.calls).toEqual(
      expect.arrayContaining([
        ['user_id', 'user-1'],
        ['log_date', '2026-07-20'],
        ['passed', false],
      ]),
    );
    expect(builder.in).toHaveBeenCalledWith('rule_id', ['creatine_daily', 'omega3_fish_oil']);
  });

  it('is a no-op for an empty rule id list', async () => {
    const { reconcileInapplicableRecommendations } = await import('~/lib/db');

    await reconcileInapplicableRecommendations('user-1', '2026-07-20', []);

    expect(fromMock).not.toHaveBeenCalled();
  });

  it('throws on update errors', async () => {
    fromMock.mockReturnValue(createBuilder({ error: { message: 'update failed' } }));
    const { reconcileInapplicableRecommendations } = await import('~/lib/db');

    await expect(
      reconcileInapplicableRecommendations('user-1', '2026-07-20', ['creatine_daily']),
    ).rejects.toThrow(/update failed/);
  });
});

describe('syncRecommendations reactivation behavior', () => {
  it('resurfaces an auto-dismissed (passed) recommendation when its rule fails again', async () => {
    // Row state produced by deactivation reconciliation (or by a pass): passed + dismissed.
    const existing = makeRec({ passed: true, dismissed: true, message: 'old message' });
    const refreshed = makeRec({ passed: false, dismissed: false });
    const selectExisting = createBuilder({ data: [existing] });
    const updateBuilder = createBuilder();
    const selectRefreshed = createBuilder({ data: [refreshed] });
    queueBuilders(selectExisting, updateBuilder, selectRefreshed);
    const { syncRecommendations } = await import('~/lib/db');

    const results: RuleResult[] = [
      { rule: makeRule('creatine_daily'), status: 'fail', message: 'Creatine MISSED.' },
    ];
    const active = await syncRecommendations('user-1', '2026-07-20', results);

    expect(updateBuilder.update).toHaveBeenCalledWith({
      passed: false,
      message: 'Creatine MISSED.',
      dismissed: false,
    });
    expect(updateBuilder.eq).toHaveBeenCalledWith('id', 'rec-1');
    expect(active).toEqual([refreshed]);
  });

  it('leaves a manually dismissed failing recommendation dismissed', async () => {
    // User dismissed a live failure: passed=false, dismissed=true, same message.
    const existing = makeRec({ passed: false, dismissed: true });
    const selectExisting = createBuilder({ data: [existing] });
    const selectRefreshed = createBuilder({ data: [existing] });
    queueBuilders(selectExisting, selectRefreshed);
    const { syncRecommendations } = await import('~/lib/db');

    const results: RuleResult[] = [
      { rule: makeRule('creatine_daily'), status: 'fail', message: 'Creatine MISSED.' },
    ];
    const active = await syncRecommendations('user-1', '2026-07-20', results);

    // No update issued and the dismissed row stays hidden.
    expect(selectExisting.update).not.toHaveBeenCalled();
    expect(selectRefreshed.update).not.toHaveBeenCalled();
    expect(active).toEqual([]);
  });
});
