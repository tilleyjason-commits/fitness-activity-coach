import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RoutinesPage from '~/pages/RoutinesPage';
import { createEmptyWeeklyRoutines, getTodayWeekday } from '~/lib/workout-mappers';

/**
 * Weekend athletes exist: routines cover all seven days, selectable at 390px
 * via 3-letter chips, defaulting to today. The training tabs are the
 * navigation — no back arrow.
 */

// Stable identity: RoutinesPage keys its load effect on `user`, so the mock
// must not return a fresh object per render (that would loop the effect).
const AUTH_VALUE = {
  user: { id: 'user-abc' },
  session: null,
  loading: false,
  signIn: async () => null,
  signUp: async () => null,
  signOut: async () => {},
};
vi.mock('~/context/AuthContext', () => ({
  useAuth: () => AUTH_VALUE,
}));

const repo = {
  getWeeklyRoutines: vi.fn(),
  saveRoutine: vi.fn(),
  saveWorkoutState: vi.fn(),
};
vi.mock('~/lib/workout-repo', () => ({
  getWeeklyRoutines: (...a: unknown[]) => repo.getWeeklyRoutines(...a),
  saveRoutine: (...a: unknown[]) => repo.saveRoutine(...a),
  saveWorkoutState: (...a: unknown[]) => repo.saveWorkoutState(...a),
}));

function renderRoutines() {
  return render(
    <MemoryRouter
      initialEntries={['/routines']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <RoutinesPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.getWeeklyRoutines.mockResolvedValue(createEmptyWeeklyRoutines());
});

async function findDayTabs() {
  const tablist = await screen.findByRole('tablist', { name: 'Training days' });
  return within(tablist).getAllByRole('tab');
}

describe('seven-day routines', () => {
  it('offers all seven days as 3-letter chips', async () => {
    renderRoutines();
    const tabs = await findDayTabs();
    expect(tabs.map((t) => t.textContent?.slice(0, 3))).toEqual([
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ]);
  });

  it('defaults the selection to today', async () => {
    renderRoutines();
    const selected = (await findDayTabs()).find(
      (t) => t.getAttribute('aria-selected') === 'true',
    );
    expect(selected?.textContent).toContain(getTodayWeekday().slice(0, 3));
  });

  it('shows no back arrow — the training tabs are the navigation', async () => {
    renderRoutines();
    await findDayTabs();
    expect(screen.queryByRole('link', { name: 'Back' })).not.toBeInTheDocument();
  });
});
