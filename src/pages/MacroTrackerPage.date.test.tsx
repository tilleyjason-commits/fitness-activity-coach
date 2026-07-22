import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { format, subDays } from 'date-fns';
import MacroTrackerPage from '~/pages/MacroTrackerPage';

/**
 * Meals date UX: the title names the selected day (with a Today badge),
 * one-handed ‹ › arrows step days, the calendar input remains, and the pager
 * cannot advance beyond today.
 */

vi.mock('~/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 't@t.com' }, loading: false }),
}));

vi.mock('~/lib/db', () => ({
  getMealLogs: () => Promise.resolve([]),
  getMealFoods: () => Promise.resolve([]),
  getProfile: () => Promise.resolve(null),
  saveMeal: vi.fn(),
  deleteMeal: vi.fn(),
  calculateMacros: vi.fn(),
}));

vi.mock('~/hooks/useDailyLog', () => ({
  useDailyLog: () => ({
    log: null,
    loading: false,
    saving: false,
    error: null,
    save: vi.fn(),
    reload: vi.fn(),
  }),
}));

function renderPage() {
  return render(
    <MemoryRouter
      initialEntries={['/macros']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <MacroTrackerPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('meals date pager', () => {
  it('titles the page with the selected day and a Today badge', async () => {
    renderPage();
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: `Meals · ${format(new Date(), 'EEE, MMM d')}`,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
  });

  it('steps back a day with the previous arrow and drops the badge', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Previous day' }));

    const yesterday = subDays(new Date(), 1);
    expect(
      screen.getByRole('heading', { level: 1, name: `Meals · ${format(yesterday, 'EEE, MMM d')}` }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Today')).not.toBeInTheDocument();
  });

  it('cannot advance beyond today', async () => {
    const user = userEvent.setup();
    renderPage();

    const next = await screen.findByRole('button', { name: 'Next day' });
    expect(next).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(next).toBeEnabled();
    await user.click(next);
    expect(next).toBeDisabled();

    // The calendar input is still there for jumps, capped at today.
    const dateInput = screen.getByLabelText('Date');
    expect(dateInput).toHaveAttribute('max', format(new Date(), 'yyyy-MM-dd'));
  });

  it('is a Log-tab child: back arrow returns to the hub', async () => {
    renderPage();
    expect(await screen.findByRole('link', { name: 'Back' })).toHaveAttribute('href', '/log');
  });
});
