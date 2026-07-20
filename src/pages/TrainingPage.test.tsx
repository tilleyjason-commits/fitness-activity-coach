import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import TrainingPage from '~/pages/TrainingPage';
import RoutinesPage from '~/pages/RoutinesPage';
import { createEmptyWeeklyRoutines, getTodayWeekday } from '~/lib/workout-mappers';
import type { WeeklyRoutines } from '~/lib/types';

// Stable identity: TrainingPage keys effects on `user`, so the mock must not
// return a fresh object per render (that would loop the load effect forever).
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
  getActiveWorkout: vi.fn(),
  getWorkoutHistory: vi.fn(),
  getWeeklyRoutines: vi.fn(),
  getRestTimerDefaultSeconds: vi.fn(),
  hasCompletedWorkout: vi.fn(),
  saveWorkoutState: vi.fn(),
  saveRoutine: vi.fn(),
  saveRestTimerDefaultSeconds: vi.fn(),
  completeWorkout: vi.fn(),
};
vi.mock('~/lib/workout-repo', () => ({
  getActiveWorkout: (...a: unknown[]) => repo.getActiveWorkout(...a),
  getWorkoutHistory: (...a: unknown[]) => repo.getWorkoutHistory(...a),
  getWeeklyRoutines: (...a: unknown[]) => repo.getWeeklyRoutines(...a),
  getRestTimerDefaultSeconds: (...a: unknown[]) => repo.getRestTimerDefaultSeconds(...a),
  hasCompletedWorkout: (...a: unknown[]) => repo.hasCompletedWorkout(...a),
  saveWorkoutState: (...a: unknown[]) => repo.saveWorkoutState(...a),
  saveRoutine: (...a: unknown[]) => repo.saveRoutine(...a),
  saveRestTimerDefaultSeconds: (...a: unknown[]) => repo.saveRestTimerDefaultSeconds(...a),
  completeWorkout: (...a: unknown[]) => repo.completeWorkout(...a),
}));

function routinesWithTodayPreset(): WeeklyRoutines {
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
    ],
    cardioExercises: [],
  };
  return weekly;
}

function renderTraining(path = '/training', strict = false) {
  const page = (
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <TrainingPage />
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{page}</StrictMode> : page);
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.getActiveWorkout.mockResolvedValue(null);
  repo.getWorkoutHistory.mockResolvedValue([]);
  repo.getWeeklyRoutines.mockResolvedValue(createEmptyWeeklyRoutines());
  repo.getRestTimerDefaultSeconds.mockResolvedValue(90);
  repo.hasCompletedWorkout.mockResolvedValue(false);
  repo.saveWorkoutState.mockResolvedValue(undefined);
});

describe('Training page tab navigation', () => {
  it('waits for the newest StrictMode load before accepting user action', async () => {
    const user = userEvent.setup();
    let resolveNewestLoad!: (value: null) => void;
    repo.getActiveWorkout
      .mockResolvedValueOnce(null)
      .mockImplementationOnce(() => new Promise<null>((resolve) => { resolveNewestLoad = resolve; }));

    renderTraining('/training', true);
    await waitFor(() => expect(repo.getActiveWorkout).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('Loading workout')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start Blank Workout' })).not.toBeInTheDocument();

    await act(async () => {
      resolveNewestLoad(null);
    });
    await user.click(await screen.findByRole('button', { name: 'Start Blank Workout' }));

    expect(await screen.findByRole('region', { name: 'Add Exercise' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Start Blank Workout' })).not.toBeInTheDocument();
  });

  it('opens with the Workout tab selected by default', async () => {
    renderTraining();
    const workoutTab = await screen.findByRole('button', { name: 'Workout' });
    expect(workoutTab).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens with History selected when navigated with ?tab=history (Routines "History" tab)', async () => {
    renderTraining('/training?tab=history');
    const historyTab = await screen.findByRole('button', { name: 'History' });
    expect(historyTab).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Workout' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

describe('Routines page History tab link', () => {
  it('links to /training with the History tab preselected', async () => {
    render(
      <MemoryRouter
        initialEntries={['/routines']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <RoutinesPage />
      </MemoryRouter>,
    );
    const historyLink = await screen.findByRole('link', { name: 'History' });
    expect(historyLink).toHaveAttribute('href', expect.stringContaining('tab=history'));
  });
});

describe('completed-routine same-day behavior', () => {
  it('does not silently auto-populate a new workout when today already has a completed one', async () => {
    repo.hasCompletedWorkout.mockResolvedValue(true);
    repo.getWeeklyRoutines.mockResolvedValue(routinesWithTodayPreset());
    renderTraining();

    // The completed message is shown instead of a freshly populated workout.
    expect(await screen.findByText(/completed/i)).toBeInTheDocument();
    expect(screen.queryByText('Bench Press')).not.toBeInTheDocument();

    // Repeating is offered only as an explicit action.
    expect(screen.getByRole('button', { name: /repeat/i })).toBeInTheDocument();
  });

  it('still auto-populates from the routine on a fresh day with no completed workout', async () => {
    repo.getWeeklyRoutines.mockResolvedValue(routinesWithTodayPreset());
    renderTraining();

    expect(await screen.findByText('Bench Press')).toBeInTheDocument();
  });
});
