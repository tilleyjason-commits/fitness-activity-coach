import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { addDays, format, startOfWeek } from 'date-fns';
import WeeklySummary from '~/pages/WeeklySummary';
import type { DailyLog } from '~/lib/types';

/**
 * Progress answers "is this working?" over weeks, not just the current one.
 * The trend range is deliberately separate from the week pager, so the two
 * time controls never fight.
 */

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

const db = {
  getLogsBetween: vi.fn(),
  getExerciseLogs: vi.fn(),
  getRecommendationsBetween: vi.fn(),
  getRecentWeighIns: vi.fn(),
  getProfile: vi.fn(),
  upsertWeeklySummary: vi.fn(),
  dismissRecommendation: vi.fn(),
};
vi.mock('~/lib/db', () => ({
  getLogsBetween: (...a: unknown[]) => db.getLogsBetween(...a),
  getExerciseLogs: (...a: unknown[]) => db.getExerciseLogs(...a),
  getRecommendationsBetween: (...a: unknown[]) => db.getRecommendationsBetween(...a),
  getRecentWeighIns: (...a: unknown[]) => db.getRecentWeighIns(...a),
  getProfile: (...a: unknown[]) => db.getProfile(...a),
  upsertWeeklySummary: (...a: unknown[]) => db.upsertWeeklySummary(...a),
  dismissRecommendation: (...a: unknown[]) => db.dismissRecommendation(...a),
}));

function iso(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

const today = new Date();
const todayIso = iso(today);
const thisMonday = startOfWeek(today, { weekStartsOn: 1 });

function makeLog(overrides: Partial<DailyLog> & { log_date: string }): DailyLog {
  return {
    id: `log-${overrides.log_date}`,
    user_id: 'user-1',
    training_done: false,
    daily_calories: null,
    daily_protein_g: null,
    sleep_quality: null,
    weekly_weight_lb: null,
    weekly_waist_inches: null,
    candy_cravings_today: 0,
    ...overrides,
  } as DailyLog;
}

/** Consecutive logged days ending today, inside the current week. */
function streakLogs(days: number): DailyLog[] {
  return Array.from({ length: days }, (_, index) =>
    makeLog({ log_date: iso(addDays(today, -index)), daily_calories: 2400, daily_protein_g: 195 }),
  );
}

function renderProgress() {
  return render(
    <MemoryRouter
      initialEntries={['/weekly']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <WeeklySummary />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  db.getLogsBetween.mockResolvedValue([]);
  db.getExerciseLogs.mockResolvedValue([]);
  db.getRecommendationsBetween.mockResolvedValue([]);
  db.getRecentWeighIns.mockResolvedValue([]);
  db.getProfile.mockResolvedValue(null);
  db.upsertWeeklySummary.mockResolvedValue(undefined);
});

describe('trend range', () => {
  it('defaults to four weeks and queries from that Monday', async () => {
    renderProgress();

    const group = screen.getByRole('group', { name: 'Trend range' });
    expect(within(group).getByRole('button', { name: '4 weeks' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const expectedStart = iso(addDays(thisMonday, -21));
    await waitFor(() =>
      expect(db.getLogsBetween).toHaveBeenCalledWith('user-1', expectedStart, todayIso),
    );
  });

  it('re-queries with a wider window when twelve weeks is chosen', async () => {
    const user = userEvent.setup();
    renderProgress();
    await waitFor(() => expect(db.getLogsBetween).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: '12 weeks' }));

    const expectedStart = iso(addDays(thisMonday, -77));
    await waitFor(() =>
      expect(db.getLogsBetween).toHaveBeenCalledWith('user-1', expectedStart, todayIso),
    );
    expect(screen.getByRole('button', { name: '12 weeks' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('keeps the trend zone above the paged week detail', async () => {
    renderProgress();
    const consistency = await screen.findByRole('region', { name: 'Consistency' });
    const weekDetail = screen.getByRole('heading', { name: 'Week detail' });

    expect(
      consistency.compareDocumentPosition(weekDetail) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe('consistency', () => {
  it('reports the current streak and days logged', async () => {
    db.getLogsBetween.mockResolvedValue(streakLogs(3));
    renderProgress();

    const card = await screen.findByRole('region', { name: 'Consistency' });
    await waitFor(() => expect(card.textContent).toMatch(/3\s*days\s*Current streak/));
    expect(card.textContent).toMatch(/3\s*Days logged in 4 weeks/);
  });

  it('shows a zero streak rather than blank when nothing is logged', async () => {
    renderProgress();

    const card = await screen.findByRole('region', { name: 'Consistency' });
    expect(card.textContent).toMatch(/0\s*days\s*Current streak/);
    expect(card.textContent).toMatch(/0\s*Days logged in 4 weeks/);
  });
});

describe('trend sections', () => {
  it('stays quiet until there is something to plot', async () => {
    renderProgress();
    await waitFor(() => expect(db.getLogsBetween).toHaveBeenCalled());

    expect(screen.queryByRole('region', { name: 'Macro adherence trend' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Training volume trend' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Weight trend' })).not.toBeInTheDocument();
  });

  it('shows macro adherence once calories are logged', async () => {
    db.getLogsBetween.mockResolvedValue(streakLogs(2));
    renderProgress();

    expect(
      await screen.findByRole('region', { name: 'Macro adherence trend' }),
    ).toBeInTheDocument();
  });

  it('shows training volume once sets are completed', async () => {
    db.getLogsBetween.mockResolvedValue([
      makeLog({ log_date: todayIso, training_done: true }),
    ]);
    db.getExerciseLogs.mockResolvedValue([
      {
        id: 'ex-1',
        daily_log_id: `log-${todayIso}`,
        exercise_name: 'Leg Press',
        sets_completed: 3,
        target_sets: 3,
        reps_completed: 10,
        target_reps: '10',
        weight_lb: 180,
        rir: 2,
        notes: null,
      },
    ]);
    renderProgress();

    expect(
      await screen.findByRole('region', { name: 'Training volume trend' }),
    ).toBeInTheDocument();
  });

  it('plots weight once there are two weigh-ins in range', async () => {
    db.getLogsBetween.mockResolvedValue([
      makeLog({ log_date: iso(addDays(today, -7)), weekly_weight_lb: 208 }),
      makeLog({ log_date: todayIso, weekly_weight_lb: 206 }),
    ]);
    renderProgress();

    expect(await screen.findByRole('region', { name: 'Weight trend' })).toBeInTheDocument();
  });

  it('survives a failed trend query without breaking the week detail', async () => {
    db.getLogsBetween.mockRejectedValue(new Error('offline'));
    renderProgress();

    const card = await screen.findByRole('region', { name: 'Consistency' });
    expect(within(card).getByText(/current streak/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Week detail' })).toBeInTheDocument();
  });
});
