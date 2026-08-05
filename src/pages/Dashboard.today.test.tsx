import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '~/pages/Dashboard';
import { createEmptyWeeklyRoutines, getTodayWeekday } from '~/lib/workout-mappers';
import type { DailyLog, WeeklyRoutines } from '~/lib/types';

/**
 * Home is the Monitor surface: one glance answers "what's today's session?"
 * (Today's Workout card), the compliance row uses protocol-neutral labels and
 * links to each logging surface, and the greeting is personal, not generic.
 */

const AUTH_VALUE = {
  user: { id: 'user-1', user_metadata: { full_name: 'Jason Tilley' } },
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

vi.mock('~/hooks/useSupplements', () => ({
  useSupplements: () => ({
    supplements: [],
    loading: false,
    error: null,
    add: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    reload: vi.fn(),
  }),
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

const repo = {
  getActiveWorkout: vi.fn(),
  getWeeklyRoutines: vi.fn(),
  hasCompletedWorkout: vi.fn(),
};
vi.mock('~/lib/workout-repo', () => ({
  getActiveWorkout: (...a: unknown[]) => repo.getActiveWorkout(...a),
  getWeeklyRoutines: (...a: unknown[]) => repo.getWeeklyRoutines(...a),
  hasCompletedWorkout: (...a: unknown[]) => repo.hasCompletedWorkout(...a),
}));

function routinesWithToday(): WeeklyRoutines {
  const weekly = createEmptyWeeklyRoutines();
  const today = getTodayWeekday();
  weekly[today] = {
    day: today,
    name: 'Push Day',
    exercises: [
      {
        exercise: { id: 'bench-press', name: 'Bench Press', muscleGroup: 'Chest' },
        targetSets: 3,
        targetReps: 8,
        targetWeight: 185,
      },
      {
        exercise: { id: 'lat-pulldown', name: 'Lat Pulldown', muscleGroup: 'Back' },
        targetSets: 3,
        targetReps: 10,
        targetWeight: 120,
      },
    ],
    cardioExercises: [],
  };
  return weekly;
}

function renderDashboard() {
  return render(
    <MemoryRouter
      initialEntries={['/']}
    >
      <Dashboard />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  dailyLogState.log = null;
  dailyLogState.loading = false;
  db.getProfile.mockResolvedValue(null);
  db.getRecentWeighIns.mockResolvedValue([]);
  db.syncRecommendations.mockResolvedValue([]);
  db.reconcileInapplicableRecommendations.mockResolvedValue(undefined);
  repo.getActiveWorkout.mockResolvedValue(null);
  repo.getWeeklyRoutines.mockResolvedValue(createEmptyWeeklyRoutines());
  repo.hasCompletedWorkout.mockResolvedValue(false);
});

describe('greeting', () => {
  it('greets with the first name from the auth profile', async () => {
    renderDashboard();
    expect(
      await screen.findByRole('heading', { level: 1, name: /good (morning|afternoon|evening), Jason/i }),
    ).toBeInTheDocument();
  });

  it('adds a coach line derived from today’s training state — no fake metrics', async () => {
    repo.getWeeklyRoutines.mockResolvedValue(routinesWithToday());
    renderDashboard();
    expect(await screen.findByText(/Push Day is on the plan today/i)).toBeInTheDocument();
  });
});

describe("Today's Workout card", () => {
  it('shows the routine name, exercise count, and a Start CTA to /training', async () => {
    repo.getWeeklyRoutines.mockResolvedValue(routinesWithToday());
    renderDashboard();

    const card = await screen.findByRole('region', { name: "Today's workout" });
    expect(within(card).getByText('Push Day')).toBeInTheDocument();
    expect(within(card).getByText(/2 exercises/i)).toBeInTheDocument();
    const cta = within(card).getByRole('link', { name: /start/i });
    expect(cta).toHaveAttribute('href', '/training');
  });

  it('shows resume state with set progress when a workout is in flight', async () => {
    repo.getActiveWorkout.mockResolvedValue({
      date: '2026-07-22',
      exercises: [
        {
          exercise: { id: 'bench-press', name: 'Bench Press', muscleGroup: 'Chest' },
          targetSets: 2,
          targetReps: 8,
          targetWeight: 185,
          sets: [
            { reps: 8, weight: 185, rir: 2, completed: true },
            { reps: 8, weight: 185, rir: null, completed: false },
          ],
        },
      ],
      cardioExercises: [],
    });
    renderDashboard();

    const card = await screen.findByRole('region', { name: "Today's workout" });
    expect(await within(card).findByText(/1\/2 sets/i)).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: /resume/i })).toHaveAttribute(
      'href',
      '/training',
    );
  });

  it('shows the done state after completing, still linking to the Workout tab', async () => {
    repo.hasCompletedWorkout.mockResolvedValue(true);
    renderDashboard();

    const card = await screen.findByRole('region', { name: "Today's workout" });
    expect(await within(card).findByText(/completed/i)).toBeInTheDocument();
    expect(within(card).getByRole('link')).toHaveAttribute('href', '/training');
  });

  it('falls back to a useful generic card when workout data cannot load', async () => {
    repo.getActiveWorkout.mockRejectedValue(new Error('offline'));
    repo.getWeeklyRoutines.mockRejectedValue(new Error('offline'));
    repo.hasCompletedWorkout.mockRejectedValue(new Error('offline'));
    renderDashboard();

    const card = await screen.findByRole('region', { name: "Today's workout" });
    expect(await within(card).findByRole('link', { name: /workout/i })).toHaveAttribute(
      'href',
      '/training',
    );
  });
});

describe('compliance row', () => {
  it('uses protocol-neutral labels (PM Protein, not Casein)', () => {
    renderDashboard();
    expect(screen.getByText('PM Protein')).toBeInTheDocument();
    expect(screen.queryByText('Casein')).not.toBeInTheDocument();
  });

  it('links every status item to its logging surface', () => {
    renderDashboard();
    const row = screen.getByRole('region', { name: "Today's compliance" });
    expect(within(row).getByRole('link', { name: /^Train:/ })).toHaveAttribute(
      'href',
      '/training',
    );
    expect(within(row).getByRole('link', { name: /^Protein:/ })).toHaveAttribute(
      'href',
      '/macros',
    );
    expect(within(row).getByRole('link', { name: /^PM Protein:/ })).toHaveAttribute(
      'href',
      '/log/nutrition',
    );
    expect(within(row).getByRole('link', { name: /^Sleep:/ })).toHaveAttribute(
      'href',
      '/log/sleep',
    );
  });
});

describe('home layout order', () => {
  it('leads with the macro figures, then workout, then compliance, then recommendations', async () => {
    renderDashboard();
    const hero = screen.getByRole('link', { name: /today's macros/i });
    const workoutCard = await screen.findByRole('region', { name: "Today's workout" });
    const compliance = screen.getByRole('region', { name: "Today's compliance" });
    const recs = screen.getByRole('region', { name: 'Recommendations' });

    expect(hero.compareDocumentPosition(workoutCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      workoutCard.compareDocumentPosition(compliance) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(compliance.compareDocumentPosition(recs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('macro hero', () => {
  it('shows calories and protein remaining against the day’s targets', () => {
    dailyLogState.log = {
      daily_calories: 1758,
      daily_protein_g: 139,
    } as unknown as DailyLog;
    renderDashboard();

    const hero = screen.getByRole('link', { name: /today's macros/i });
    expect(within(hero).getByText('742')).toBeInTheDocument();
    expect(within(hero).getByText('1,758 of 2,500')).toBeInTheDocument();
    expect(within(hero).getByText('61')).toBeInTheDocument();
    expect(within(hero).getByText('139 of 200')).toBeInTheDocument();
  });

  it('flips to an "over" reading once calories pass the band', () => {
    dailyLogState.log = {
      daily_calories: 2900,
      daily_protein_g: 210,
    } as unknown as DailyLog;
    renderDashboard();

    const hero = screen.getByRole('link', { name: /today's macros/i });
    expect(within(hero).getByText(/calories over/i)).toBeInTheDocument();
    expect(within(hero).getByText('400')).toBeInTheDocument();
  });

  it('labels calories above target but still inside the acceptable band consistently', () => {
    dailyLogState.log = {
      daily_calories: 2550,
      daily_protein_g: 200,
    } as unknown as DailyLog;
    renderDashboard();

    const hero = screen.getByRole('link', { name: /today's macros/i });
    expect(within(hero).getByText(/calories above target · in range/i)).toBeInTheDocument();
    const bar = within(hero).getByRole('progressbar', { name: 'Calories logged' });
    expect(bar.firstElementChild).toHaveClass('bg-emerald-500');
  });

  it('shows the full target as remaining before anything is logged', () => {
    renderDashboard();

    const hero = screen.getByRole('link', { name: /today's macros/i });
    expect(hero).toHaveAttribute('href', '/macros');
    expect(within(hero).getByText('2,500')).toBeInTheDocument();
    expect(within(hero).getByText('200')).toBeInTheDocument();
  });
});
