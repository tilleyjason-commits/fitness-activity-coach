import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { addDays, format, startOfWeek, subDays } from 'date-fns';
import WeeklySummary from '~/pages/WeeklySummary';

/**
 * Progress is a root tab: exact title, no back arrow, and a week pager so
 * "did last week's fix work?" is answerable. Paging cannot move past the
 * current week.
 */

// Stable identity: the page keys its load effect on `user`; a fresh object
// per render would loop the effect forever.
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
  upsertWeeklySummary: vi.fn(),
  dismissRecommendation: vi.fn(),
};
vi.mock('~/lib/db', () => ({
  getLogsBetween: (...a: unknown[]) => db.getLogsBetween(...a),
  getExerciseLogs: (...a: unknown[]) => db.getExerciseLogs(...a),
  getRecommendationsBetween: (...a: unknown[]) => db.getRecommendationsBetween(...a),
  getRecentWeighIns: (...a: unknown[]) => db.getRecentWeighIns(...a),
  upsertWeeklySummary: (...a: unknown[]) => db.upsertWeeklySummary(...a),
  dismissRecommendation: (...a: unknown[]) => db.dismissRecommendation(...a),
}));

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

const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });

beforeEach(() => {
  vi.clearAllMocks();
  db.getLogsBetween.mockResolvedValue([]);
  db.getExerciseLogs.mockResolvedValue([]);
  db.getRecommendationsBetween.mockResolvedValue([]);
  db.getRecentWeighIns.mockResolvedValue([]);
  db.upsertWeeklySummary.mockResolvedValue(undefined);
});

describe('Progress root header', () => {
  it('titles the page "Progress" with no back arrow', async () => {
    renderProgress();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Progress' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Back' })).not.toBeInTheDocument();
  });
});

describe('week pager', () => {
  it('defaults to the current Monday–Sunday window', async () => {
    renderProgress();
    await waitFor(() => expect(db.getLogsBetween).toHaveBeenCalled());
    expect(db.getLogsBetween.mock.calls[0].slice(1)).toEqual([
      format(currentWeekStart, 'yyyy-MM-dd'),
      format(addDays(currentWeekStart, 6), 'yyyy-MM-dd'),
    ]);
  });

  it('pages to the previous week and re-queries with the shifted range', async () => {
    const user = userEvent.setup();
    renderProgress();
    await waitFor(() => expect(db.getLogsBetween).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: /previous week/i }));

    await waitFor(() => {
      const ranges = db.getLogsBetween.mock.calls.map((c) => c[1]);
      expect(ranges).toContain(format(subDays(currentWeekStart, 7), 'yyyy-MM-dd'));
    });
  });

  it('cannot advance past the current week', async () => {
    const user = userEvent.setup();
    renderProgress();
    await waitFor(() => expect(db.getLogsBetween).toHaveBeenCalled());

    const next = screen.getByRole('button', { name: /next week/i });
    expect(next).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /previous week/i }));
    await waitFor(() => expect(next).toBeEnabled());
    await user.click(next);
    await waitFor(() => expect(next).toBeDisabled());
  });

  it('links the empty state to useful log actions', async () => {
    renderProgress();
    await waitFor(() => expect(db.getLogsBetween).toHaveBeenCalled());
    expect(await screen.findByRole('link', { name: /log a meal/i })).toHaveAttribute(
      'href',
      '/macros',
    );
    expect(screen.getByRole('link', { name: /log training/i })).toHaveAttribute(
      'href',
      '/training',
    );
  });
});
