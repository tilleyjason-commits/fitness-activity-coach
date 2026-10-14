import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LogNutrition from '~/pages/LogNutrition';
import LogTraining from '~/pages/LogTraining';
import { format } from 'date-fns';

const useDailyLogMock = vi.fn();
vi.mock('~/hooks/useDailyLog', () => ({
  useDailyLog: (date: string) => useDailyLogMock(date),
}));
vi.mock('~/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}));
vi.mock('~/lib/db', () => ({
  getProfile: () => Promise.resolve(null),
  getExerciseLogs: () => Promise.resolve([]),
  replaceExerciseLogs: vi.fn(),
}));
const hasCompletedWorkoutMock = vi.fn();
vi.mock('~/lib/workout-repo', () => ({
  hasCompletedWorkout: (...args: unknown[]) => hasCompletedWorkoutMock(...args),
}));

const today = format(new Date(), 'yyyy-MM-dd');
const emptyHook = { log: null, loading: false, saving: false, error: null, save: vi.fn(), reload: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  useDailyLogMock.mockReturnValue(emptyHook);
  hasCompletedWorkoutMock.mockResolvedValue(false);
});

describe('daily totals & timing page (past days)', () => {
  it('edits the date in ?date= instead of always editing today', () => {
    render(
      <MemoryRouter initialEntries={['/log/nutrition?date=2026-10-01']}>
        <LogNutrition />
      </MemoryRouter>,
    );
    expect(useDailyLogMock).toHaveBeenCalledWith('2026-10-01');
    expect(screen.getByLabelText('Date')).toHaveValue('2026-10-01');
    expect(screen.getByRole('heading', { name: /daily totals & timing/i })).toBeInTheDocument();
  });

  it('ignores a future or malformed date and falls back to today', () => {
    render(
      <MemoryRouter initialEntries={['/log/nutrition?date=2999-01-01']}>
        <LogNutrition />
      </MemoryRouter>,
    );
    expect(useDailyLogMock).toHaveBeenCalledWith(today);
    expect(screen.getByLabelText('Date')).toHaveValue(today);
  });
});

describe('missed-session page', () => {
  it('warns when a live workout already exists for the date', async () => {
    hasCompletedWorkoutMock.mockResolvedValue(true);
    render(
      <MemoryRouter initialEntries={['/log/training']}>
        <LogTraining />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('status')).toHaveTextContent(/already logged live/i);
    expect(screen.getByRole('link', { name: /open the workout tab/i })).toHaveAttribute(
      'href',
      '/training',
    );
    expect(hasCompletedWorkoutMock).toHaveBeenCalledWith('u1', today);
  });

  it('shows no warning for a date without a live workout', async () => {
    render(
      <MemoryRouter initialEntries={['/log/training']}>
        <LogTraining />
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: /add a missed session/i });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
