import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '~/pages/Dashboard';
import type { DailyLog, Recommendation, UserSupplement } from '~/lib/types';
import type { RuleResult } from '~/lib/evaluate';

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

const dailyLogState: { log: DailyLog | null; loading: boolean } = { log: null, loading: false };
vi.mock('~/hooks/useDailyLog', () => ({
  useDailyLog: () => ({
    log: dailyLogState.log,
    loading: dailyLogState.loading,
    saving: false,
    error: null,
    save: vi.fn(),
    reload: vi.fn(),
  }),
}));

const useSupplementsMock = vi.fn();
vi.mock('~/hooks/useSupplements', () => ({
  useSupplements: (...a: unknown[]) => useSupplementsMock(...a),
}));

const db = {
  getProfile: vi.fn(),
  getRecentWeighIns: vi.fn(),
  syncRecommendations: vi.fn(),
  reconcileInapplicableRecommendations: vi.fn(),
  dismissRecommendation: vi.fn(),
};
vi.mock('~/lib/db', () => ({
  getProfile: (...a: unknown[]) => db.getProfile(...a),
  getRecentWeighIns: (...a: unknown[]) => db.getRecentWeighIns(...a),
  syncRecommendations: (...a: unknown[]) => db.syncRecommendations(...a),
  reconcileInapplicableRecommendations: (...a: unknown[]) =>
    db.reconcileInapplicableRecommendations(...a),
  dismissRecommendation: (...a: unknown[]) => db.dismissRecommendation(...a),
}));

function makeLog(overrides: Partial<DailyLog> = {}): DailyLog {
  return {
    id: 'log-1',
    user_id: 'user-1',
    log_date: '2026-07-20',
    day_of_week: 'Saturday',
    training_done: false,
    training_session_type: null,
    compound_rir: null,
    isolation_rir: null,
    double_progression_followed: null,
    barbell_squat_done: false,
    barbell_ohp_done: false,
    daily_calories: null,
    daily_protein_g: null,
    daily_carbs_g: null,
    daily_fat_g: null,
    pre_gym_snack_time: null,
    post_gym_meal_time: null,
    snack_3pm_logged: false,
    casein_taken: false,
    dinner_logged: false,
    dinner_plates: 1,
    dinner_protein_first: false,
    candy_cravings_today: 0,
    creatine_taken: false,
    beta_alanine_taken: false,
    omega3_taken: false,
    caffeine_mg: null,
    vitamin_d_taken: false,
    magnesium_taken: false,
    last_caffeine_time: null,
    caffeine_cutoff_respected: null,
    bedtime: '22:00',
    waketime: null,
    last_screen_time: null,
    early_wake: false,
    sleep_quality: null,
    energy_score: null,
    stress_score: null,
    hunger_score: null,
    meals_count: null,
    compound_rest_sec: null,
    isolation_rest_sec: null,
    session_minutes: null,
    full_rom_followed: false,
    last_deload_date: null,
    weekly_weight_lb: null,
    weekly_waist_inches: null,
    notes: null,
    created_at: '2026-07-20T00:00:00Z',
    ...overrides,
  };
}

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

let listState: {
  supplements: UserSupplement[];
  loading: boolean;
  error: string | null;
  add: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  reload: ReturnType<typeof vi.fn>;
};

function renderDashboard() {
  return render(
    <MemoryRouter
      initialEntries={['/']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Dashboard />
    </MemoryRouter>,
  );
}

function syncedRuleIds(): string[] {
  const results = db.syncRecommendations.mock.calls[0][2] as RuleResult[];
  return results.map((r) => r.rule.id);
}

const BUILT_IN_RULE_IDS = [
  'creatine_daily',
  'vitamin_d_daily',
  'magnesium_glycinate_bed',
  'omega3_fish_oil',
  'beta_alanine_compliance',
];

const originalConsoleError = console.error.bind(console);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation((message, ...args) => {
    if (typeof message === 'string' && message.startsWith('Trigger clause "')) return;
    originalConsoleError(message, ...args);
  });
  dailyLogState.log = makeLog();
  dailyLogState.loading = false;
  db.getProfile.mockResolvedValue(null);
  db.getRecentWeighIns.mockResolvedValue([]);
  db.syncRecommendations.mockResolvedValue([]);
  db.reconcileInapplicableRecommendations.mockResolvedValue(undefined);
  listState = {
    supplements: [makeSupplement()],
    loading: false,
    error: null,
    add: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    reload: vi.fn(),
  };
  useSupplementsMock.mockImplementation(() => listState);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('supplements quick action', () => {
  it('adds a Log Supplements quick action beside the existing three', () => {
    renderDashboard();
    expect(screen.getByRole('link', { name: /Log Supplements/ })).toHaveAttribute(
      'href',
      expect.stringContaining('/log/supplements'),
    );
    expect(screen.getByRole('link', { name: /Log Workout/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Log Nutrition/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Log Sleep/ })).toBeInTheDocument();
  });
});

describe('conditional Creatine compliance dot', () => {
  it('shows the Creatine dot when canonical creatine is active', async () => {
    renderDashboard();
    expect(await screen.findByRole('img', { name: /^Creatine:/ })).toBeInTheDocument();
  });

  it('hides the Creatine dot when creatine is deactivated, keeping the others', async () => {
    listState.supplements = [makeSupplement({ active: false })];
    renderDashboard();

    await waitFor(() => expect(db.syncRecommendations).toHaveBeenCalled());
    expect(screen.queryByRole('img', { name: /^Creatine:/ })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Train:/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Sleep:/ })).toBeInTheDocument();
  });

  it('renders the other compliance dots without Creatine while the list loads', () => {
    listState.loading = true;
    renderDashboard();

    expect(screen.getByRole('img', { name: /^Train:/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Casein:/ })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /^Creatine:/ })).not.toBeInTheDocument();
  });

  it('falls back to showing Creatine if the supplement list fails to load', async () => {
    listState.supplements = [];
    listState.error = 'relation missing';
    renderDashboard();

    expect(await screen.findByRole('img', { name: /^Creatine:/ })).toBeInTheDocument();
  });
});

describe('recommendation applicability reconciliation', () => {
  it('syncs only applicable rules and reconciles the inactive built-ins away', async () => {
    // Only creatine active: the other four built-in rules are inapplicable.
    renderDashboard();

    await waitFor(() => expect(db.syncRecommendations).toHaveBeenCalled());
    const ids = syncedRuleIds();
    expect(ids).toContain('creatine_daily');
    expect(ids).toContain('caffeine_dose_monitor');
    expect(ids).toContain('protein_daily_target');
    for (const ruleId of BUILT_IN_RULE_IDS.filter((r) => r !== 'creatine_daily')) {
      expect(ids).not.toContain(ruleId);
    }

    const [userId, logDate, reconciledIds] =
      db.reconcileInapplicableRecommendations.mock.calls[0] as [string, string, string[]];
    expect(userId).toBe('user-1');
    // Dashboard reconciles the date it displays: today.
    expect(logDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(reconciledIds.sort()).toEqual(
      BUILT_IN_RULE_IDS.filter((r) => r !== 'creatine_daily').sort(),
    );
    expect(reconciledIds).not.toContain('caffeine_dose_monitor');
  });

  it('reconciles all five built-ins when none are active', async () => {
    listState.supplements = [makeSupplement({ active: false })];
    renderDashboard();

    await waitFor(() => expect(db.syncRecommendations).toHaveBeenCalled());
    const ids = syncedRuleIds();
    for (const ruleId of BUILT_IN_RULE_IDS) {
      expect(ids).not.toContain(ruleId);
    }
    const reconciledIds =
      db.reconcileInapplicableRecommendations.mock.calls[0][2] as string[];
    expect(reconciledIds.sort()).toEqual([...BUILT_IN_RULE_IDS].sort());
  });

  it('reconciles an inactive rule even when its trigger does not evaluate today', async () => {
    dailyLogState.log = makeLog({ bedtime: null });
    renderDashboard();

    await waitFor(() => expect(db.reconcileInapplicableRecommendations).toHaveBeenCalled());
    const reconciledIds =
      db.reconcileInapplicableRecommendations.mock.calls[0][2] as string[];
    expect(reconciledIds).toContain('magnesium_glycinate_bed');
  });

  it('a reactivated supplement is synced again (its rule can resurface)', async () => {
    listState.supplements = [
      makeSupplement({ id: 'supp-1', slug: 'creatine', active: true }),
      makeSupplement({ id: 'supp-2', slug: 'omega-3', name: 'Omega-3', active: true }),
    ];
    renderDashboard();

    await waitFor(() => expect(db.syncRecommendations).toHaveBeenCalled());
    const ids = syncedRuleIds();
    expect(ids).toContain('creatine_daily');
    expect(ids).toContain('omega3_fish_oil');
    const reconciledIds =
      db.reconcileInapplicableRecommendations.mock.calls[0][2] as string[];
    expect(reconciledIds.sort()).toEqual(
      ['vitamin_d_daily', 'magnesium_glycinate_bed', 'beta_alanine_compliance'].sort(),
    );
  });

  it('ignores a stale recommendation sync after supplement applicability changes', async () => {
    let resolveFirst!: (rows: Recommendation[]) => void;
    const firstSync = new Promise<Recommendation[]>((resolve) => { resolveFirst = resolve; });
    const oldRecommendation: Recommendation = {
      id: 'old-rec', user_id: 'user-1', log_date: '2026-07-20',
      rule_id: 'creatine_daily', message: 'Stale creatine recommendation',
      severity: 'medium', passed: false, dismissed: false, created_at: '2026-07-20T00:00:00Z',
    };
    const freshRecommendation: Recommendation = {
      id: 'fresh-rec', user_id: 'user-1', log_date: '2026-07-20',
      rule_id: 'protein_daily_target', message: 'Fresh protein recommendation',
      severity: 'medium', passed: false, dismissed: false, created_at: '2026-07-20T00:00:00Z',
    };
    db.syncRecommendations
      .mockImplementationOnce(() => firstSync)
      .mockResolvedValueOnce([freshRecommendation]);

    const view = renderDashboard();
    await waitFor(() => expect(db.syncRecommendations).toHaveBeenCalledTimes(1));

    listState = {
      ...listState,
      supplements: [makeSupplement({ active: false })],
    };
    view.rerender(
      <MemoryRouter
        initialEntries={['/']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Dashboard />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Fresh protein recommendation')).toBeInTheDocument();

    await act(async () => {
      resolveFirst([oldRecommendation]);
      await firstSync;
    });

    expect(screen.getByText('Fresh protein recommendation')).toBeInTheDocument();
    expect(screen.queryByText('Stale creatine recommendation')).not.toBeInTheDocument();
  });

  it('does not sync until the supplement list settles', async () => {
    listState.loading = true;
    renderDashboard();

    expect(screen.getByText(/evaluating today's rules/i)).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(db.syncRecommendations).not.toHaveBeenCalled();
    expect(db.reconcileInapplicableRecommendations).not.toHaveBeenCalled();
  });

  it('falls back to syncing everything when the supplement list fails to load', async () => {
    listState.supplements = [];
    listState.error = 'relation missing';
    renderDashboard();

    await waitFor(() => expect(db.syncRecommendations).toHaveBeenCalled());
    expect(syncedRuleIds()).toContain('creatine_daily');
    expect(db.reconcileInapplicableRecommendations).not.toHaveBeenCalled();
  });
});
