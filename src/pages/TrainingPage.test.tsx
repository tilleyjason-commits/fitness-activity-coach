import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { format } from 'date-fns';
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

const overloadMock = vi.hoisted(() => ({ recordOverloadDecision: vi.fn() }));
vi.mock('~/lib/plan-repo', () => ({
  recordOverloadDecision: overloadMock.recordOverloadDecision,
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
    >
      <TrainingPage />
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{page}</StrictMode> : page);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  repo.getActiveWorkout.mockResolvedValue(null);
  repo.getWorkoutHistory.mockResolvedValue([]);
  repo.getWeeklyRoutines.mockResolvedValue(createEmptyWeeklyRoutines());
  repo.getRestTimerDefaultSeconds.mockResolvedValue(90);
  repo.hasCompletedWorkout.mockResolvedValue(false);
  repo.saveWorkoutState.mockResolvedValue(undefined);
  repo.saveRoutine.mockResolvedValue(undefined);
  repo.completeWorkout.mockResolvedValue(undefined);
  overloadMock.recordOverloadDecision.mockResolvedValue(undefined);
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
      >
        <RoutinesPage />
      </MemoryRouter>,
    );
    const historyLink = await screen.findByRole('link', { name: 'History' });
    expect(historyLink).toHaveAttribute('href', expect.stringContaining('tab=history'));
  });
});

describe('active-workout operate layout', () => {
  function activeWorkout() {
    return {
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
    };
  }

  it('titles the root page "Workout"', async () => {
    renderTraining();
    expect(await screen.findByRole('heading', { level: 1, name: 'Workout' })).toBeInTheDocument();
  });

  it('orders a sticky progress header before the tracker, with add-exercise collapsed below', async () => {
    repo.getActiveWorkout.mockResolvedValue(activeWorkout());
    renderTraining();

    const progress = await screen.findByRole('region', { name: 'Session progress' });
    expect(progress.className).toMatch(/sticky/);

    const trackerCard = screen.getByText('Bench Press');
    const addRow = screen.getByRole('button', { name: /add exercise/i });

    // DOM order: progress → tracker → collapsed add-exercise row.
    expect(progress.compareDocumentPosition(trackerCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(trackerCard.compareDocumentPosition(addRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // The full selector stays collapsed until asked for.
    expect(screen.queryByRole('region', { name: 'Add Exercise' })).not.toBeInTheDocument();
  });

  it('expands the exercise selector from the collapsed add-exercise row', async () => {
    const user = userEvent.setup();
    repo.getActiveWorkout.mockResolvedValue(activeWorkout());
    renderTraining();

    await user.click(await screen.findByRole('button', { name: /add exercise/i }));
    expect(screen.getByRole('region', { name: 'Add Exercise' })).toBeVisible();
  });

  it('keeps the selector visible when the workout has no items yet', async () => {
    const user = userEvent.setup();
    renderTraining();

    await user.click(await screen.findByRole('button', { name: 'Start Blank Workout' }));
    expect(await screen.findByRole('region', { name: 'Add Exercise' })).toBeVisible();
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

describe('mobile remount / window-switch restore', () => {
  it('restores a logged set from the local draft after the page remounts', async () => {
    const user = userEvent.setup();
    localStorage.clear();
    repo.getWeeklyRoutines.mockResolvedValue(routinesWithTodayPreset());
    const first = renderTraining();

    expect(await screen.findByText('Bench Press')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /complete set 1/i }));
    expect(screen.getByText(/1\/3 sets/i)).toBeInTheDocument();

    // Mobile Safari / PWA token refresh remounts TrainingPage before the
    // debounced cloud save lands. The draft must still restore the set.
    repo.getActiveWorkout.mockResolvedValue({
      date: new Date().toISOString().slice(0, 10),
      exercises: [
        {
          exercise: { id: 'bench-press', name: 'Bench Press', muscleGroup: 'Chest' },
          targetSets: 3,
          targetReps: 8,
          targetWeight: 185,
          sets: [
            { reps: 8, weight: 185, rir: null, completed: false },
            { reps: 8, weight: 185, rir: null, completed: false },
            { reps: 8, weight: 185, rir: null, completed: false },
          ],
        },
      ],
      cardioExercises: [],
    });

    first.unmount();
    renderTraining();

    expect(await screen.findByText(/1\/3 sets/i)).toBeInTheDocument();
  });

  it('keeps the rest timer visible after the page remounts', async () => {
    const user = userEvent.setup();
    repo.getWeeklyRoutines.mockResolvedValue(routinesWithTodayPreset());
    const first = renderTraining();

    expect(await screen.findByText('Bench Press')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /complete set 1/i }));
    expect(screen.getByRole('dialog', { name: 'Rest timer' })).toBeInTheDocument();

    first.unmount();
    renderTraining();

    expect(await screen.findByRole('dialog', { name: 'Rest timer' })).toBeInTheDocument();
  });
});

describe('routine target carry-forward after a completed set', () => {
  it('persists the completed set as that slot on today\'s routine', async () => {
    const user = userEvent.setup();
    repo.getWeeklyRoutines.mockResolvedValue(routinesWithTodayPreset());
    renderTraining();

    expect(await screen.findByText('Bench Press')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /complete set 1/i }));

    await waitFor(() => expect(repo.saveRoutine).toHaveBeenCalled());
    const saved = repo.saveRoutine.mock.calls.at(-1)?.[0] as {
      exercises: Array<{ exercise: { id: string }; setTargets?: Array<{ reps: number; weight: number }> }>;
    };
    expect(saved.exercises[0].exercise.id).toBe('bench-press');
    expect(saved.exercises[0].setTargets?.[0]).toEqual({ reps: 8, weight: 185 });
  });

  it('keeps set 1 when set 2 is completed later', async () => {
    const user = userEvent.setup();
    repo.getWeeklyRoutines.mockResolvedValue(routinesWithTodayPreset());
    renderTraining();

    expect(await screen.findByText('Bench Press')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /complete set 1/i }));
    await user.click(await screen.findByRole('button', { name: /complete set 2/i }));

    await waitFor(() => {
      const saved = repo.saveRoutine.mock.calls.at(-1)?.[0] as {
        exercises: Array<{ setTargets?: Array<{ reps: number; weight: number }> }>;
      };
      expect(saved.exercises[0].setTargets).toEqual([
        { reps: 8, weight: 185 },
        { reps: 8, weight: 185 },
        { reps: 8, weight: 185 },
      ]);
    });
  });

  it('does not rewrite the routine when a logged exercise is not on the preset', async () => {
    const user = userEvent.setup();
    renderTraining();
    await user.click(await screen.findByRole('button', { name: 'Start Blank Workout' }));
    expect(await screen.findByRole('region', { name: 'Add Exercise' })).toBeVisible();
    expect(repo.saveRoutine).not.toHaveBeenCalled();
  });
});

describe('previous-session prefill', () => {
  it('preserves an RIR edit made before delayed history resolves', async () => {
    const user = userEvent.setup();
    let resolveHistory!: (value: ReturnType<typeof lastSession>[]) => void;
    repo.getWorkoutHistory.mockImplementationOnce(() => new Promise((resolve) => { resolveHistory = resolve; }));
    repo.getWeeklyRoutines.mockResolvedValue(routinesWithTodayPreset());
    renderTraining();
    await screen.findByText('Bench Press');
    await user.click(screen.getByLabelText('Increase RIR for set 1'));
    await user.click(screen.getByLabelText('Increase RIR for set 1'));
    expect(screen.getByLabelText('Set 1 RIR 3')).toBeInTheDocument();
    await act(async () => { resolveHistory([lastSession()]); });
    expect(screen.getByLabelText('Set 1 RIR 3')).toBeInTheDocument();
  });

  it('preserves restored uncompleted draft edits when its marker is absent', async () => {
    const draft = lastSession();
    draft.date = format(new Date(), 'yyyy-MM-dd');
    draft.exercises[0].sets = [
      { reps: 6, weight: 150, rir: 4, completed: false },
      { reps: 6, weight: 150, rir: 4, completed: false },
    ];
    localStorage.setItem('fac-workout-draft-v1:user-abc', JSON.stringify(draft));
    repo.getWorkoutHistory.mockResolvedValue([lastSession()]);
    renderTraining();
    await screen.findByText('Bench Press');
    expect(screen.getAllByText('6 × 150 lb')).toHaveLength(2);
    expect(screen.getByLabelText('Set 1 RIR 4')).toBeInTheDocument();
  });
  it('preserves an uncompleted cloud workout without a local marker', async () => {
    const cloud = lastSession();
    cloud.date = format(new Date(), 'yyyy-MM-dd');
    cloud.exercises[0].sets = [{ reps: 6, weight: 150, rir: 4, completed: false }];
    repo.getActiveWorkout.mockResolvedValue(cloud);
    repo.getWorkoutHistory.mockResolvedValue([lastSession()]);
    renderTraining();
    expect(await screen.findByText('6 × 150 lb')).toBeInTheDocument();
    expect(screen.getByLabelText('Set 1 RIR 4')).toBeInTheDocument();
  });

  it('still prefills an untouched auto-saved routine after leaving and reopening', async () => {
    repo.getWorkoutHistory.mockImplementationOnce(() => new Promise(() => {}));
    repo.getWeeklyRoutines.mockResolvedValue(routinesWithTodayPreset());
    const first = renderTraining();
    await screen.findByText('Bench Press');
    expect(screen.getAllByText('8 × 185 lb')).toHaveLength(3);
    first.unmount();
    repo.getWorkoutHistory.mockResolvedValue([lastSession()]);
    renderTraining();
    expect(await screen.findByText('9 × 195 lb')).toBeInTheDocument();
  });

  it('protects an edited pending seed after reopening even if its marker is lost', async () => {
    const user = userEvent.setup();
    repo.getWorkoutHistory.mockImplementationOnce(() => new Promise(() => {}));
    repo.getWeeklyRoutines.mockResolvedValue(routinesWithTodayPreset());
    const first = renderTraining();
    await screen.findByText('Bench Press');
    await user.click(screen.getByLabelText('Increase RIR for set 1'));
    await user.click(screen.getByLabelText('Increase RIR for set 1'));
    first.unmount();
    localStorage.removeItem(`fac-prefilled-v1:user-abc:${format(new Date(), 'yyyy-MM-dd')}`);
    repo.getWorkoutHistory.mockResolvedValue([lastSession()]);
    renderTraining();
    expect(await screen.findByLabelText('Set 1 RIR 3')).toBeInTheDocument();
    expect(screen.getAllByText('8 × 185 lb')).toHaveLength(3);
  });

  it('still fills an untouched routine when history arrives late', async () => {
    let resolveHistory!: (value: ReturnType<typeof lastSession>[]) => void;
    repo.getWorkoutHistory.mockImplementationOnce(() => new Promise((resolve) => { resolveHistory = resolve; }));
    repo.getWeeklyRoutines.mockResolvedValue(routinesWithTodayPreset());
    renderTraining();
    await screen.findByText('Bench Press');
    expect(screen.getAllByText('8 × 185 lb')).toHaveLength(3);
    await act(async () => { resolveHistory([lastSession()]); });
    expect(screen.getByText('9 × 195 lb')).toBeInTheDocument();
    expect(screen.getByText('7 × 200 lb')).toBeInTheDocument();
  });

  it('preserves early RIR edits when localStorage writes fail', async () => {
    const user = userEvent.setup();
    const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    try {
      let resolveHistory!: (value: ReturnType<typeof lastSession>[]) => void;
      repo.getWorkoutHistory.mockImplementationOnce(() => new Promise((resolve) => { resolveHistory = resolve; }));
      repo.getWeeklyRoutines.mockResolvedValue(routinesWithTodayPreset());
      renderTraining();
      await screen.findByText('Bench Press');
      await user.click(screen.getByLabelText('Increase RIR for set 1'));
      await user.click(screen.getByLabelText('Increase RIR for set 1'));
      await act(async () => { resolveHistory([lastSession()]); });
      expect(screen.getByLabelText('Set 1 RIR 3')).toBeInTheDocument();
    } finally {
      storage.mockRestore();
    }
  });

  function lastSession() {
    return {
      id: 'h1',
      loggedAt: '2020-01-06T12:00:00Z',
      totalSets: 2,
      completedSets: 2,
      totalCardioMinutes: 0,
      totalCardioMiles: 0,
      date: '2020-01-06',
      cardioExercises: [],
      exercises: [
        {
          exercise: { id: 'bench-press', name: 'Bench Press', muscleGroup: 'Chest' },
          targetSets: 2,
          targetReps: 8,
          targetWeight: 185,
          sets: [
            { reps: 9, weight: 195, rir: 2, completed: true },
            { reps: 7, weight: 200, rir: 1, completed: true },
          ],
        },
      ],
    };
  }

  it('fills the seeded routine sets with last session reps, weight and RIR', async () => {
    repo.getWeeklyRoutines.mockResolvedValue(routinesWithTodayPreset());
    repo.getWorkoutHistory.mockResolvedValue([lastSession()]);
    renderTraining();

    expect(await screen.findByText('9 \u00d7 195 lb')).toBeInTheDocument();
    expect(screen.getByText('7 \u00d7 200 lb')).toBeInTheDocument();
    expect(screen.getByLabelText('Set 1 RIR 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Set 2 RIR 1')).toBeInTheDocument();
    // Third routine set has no counterpart last time: keeps the routine target, no RIR.
    expect(screen.getByText('8 \u00d7 185 lb')).toBeInTheDocument();
    expect(screen.getByLabelText('Set 3 RIR not set')).toBeInTheDocument();
  });

  it('does not re-apply over edits after a remount', async () => {
    const user = userEvent.setup();
    repo.getWeeklyRoutines.mockResolvedValue(routinesWithTodayPreset());
    repo.getWorkoutHistory.mockResolvedValue([lastSession()]);
    const first = renderTraining();
    await screen.findByText('9 \u00d7 195 lb');

    await user.click(screen.getByLabelText('Increase RIR for set 1'));
    expect(screen.getByLabelText('Set 1 RIR 3')).toBeInTheDocument();
    first.unmount();

    repo.getActiveWorkout.mockResolvedValue(null);
    renderTraining();
    expect(await screen.findByLabelText('Set 1 RIR 3')).toBeInTheDocument();
  });
});

describe('duplicate exercise occurrences', () => {
  const BENCH = { id: 'bench-press', name: 'Bench Press', muscleGroup: 'Chest' };

  /** Today's preset puts Bench on the plan twice: a top set and a back-off. */
  function duplicateRoutine(): WeeklyRoutines {
    const weekly = createEmptyWeeklyRoutines();
    const today = getTodayWeekday();
    weekly[today] = {
      day: today,
      name: 'Push Day',
      cardioExercises: [],
      exercises: [
        { exercise: BENCH, targetSets: 2, targetReps: 8, targetWeight: 185 },
        { exercise: BENCH, targetSets: 1, targetReps: 15, targetWeight: 135 },
      ],
    };
    return weekly;
  }

  function session(
    occurrences: Array<Array<{ reps: number; weight: number; rir: number | null; setType?: 'working' | 'warmup' }>>,
    date = '2020-01-06',
  ) {
    return {
      id: `h-${date}`,
      loggedAt: `${date}T12:00:00Z`,
      date,
      totalSets: occurrences.reduce((total, sets) => total + sets.length, 0),
      completedSets: occurrences.reduce((total, sets) => total + sets.length, 0),
      totalCardioMinutes: 0,
      totalCardioMiles: 0,
      cardioExercises: [],
      exercises: occurrences.map((sets) => ({
        exercise: BENCH,
        targetSets: sets.length,
        targetReps: sets[0].reps,
        targetWeight: sets[0].weight,
        sets: sets.map((set) => ({ ...set, completed: true })),
      })),
    };
  }

  function twoOccurrences() {
    return session([[{ reps: 5, weight: 225, rir: 1 }], [{ reps: 12, weight: 145, rir: 2 }]]);
  }

  it('prefills each routine copy from its own prior occurrence', async () => {
    repo.getWeeklyRoutines.mockResolvedValue(duplicateRoutine());
    repo.getWorkoutHistory.mockResolvedValue([twoOccurrences()]);
    renderTraining();

    // First copy: top set from the first prior Bench, second set keeps its target.
    expect(await screen.findByText('5 × 225 lb')).toBeInTheDocument();
    // Second copy: the back-off numbers, not the top set repeated.
    expect(screen.getByText('12 × 145 lb')).toBeInTheDocument();
    expect(screen.queryByText('15 × 135 lb')).not.toBeInTheDocument();
    expect(screen.getByText(/Last time: 12 × 145 lb/)).toBeInTheDocument();
  });

  it('keeps a copy on its targets when the newest session lacks that occurrence', async () => {
    repo.getWeeklyRoutines.mockResolvedValue(duplicateRoutine());
    repo.getWorkoutHistory.mockResolvedValue([session([[{ reps: 5, weight: 225, rir: 1 }]])]);
    renderTraining();

    expect(await screen.findByText('5 × 225 lb')).toBeInTheDocument();
    // No second Bench last time: the back-off keeps its own target and no hint.
    expect(screen.getByText('15 × 135 lb')).toBeInTheDocument();
    expect(screen.getAllByText(/Last time:/)).toHaveLength(1);
  });

  it('fills the untouched copy while keeping an edit on the other', async () => {
    const user = userEvent.setup();
    let resolveHistory!: (value: ReturnType<typeof session>[]) => void;
    repo.getWorkoutHistory.mockImplementationOnce(
      () => new Promise((resolve) => { resolveHistory = resolve; }),
    );
    repo.getWeeklyRoutines.mockResolvedValue(duplicateRoutine());
    renderTraining();
    await screen.findAllByText('Bench Press');

    // Raise the back-off copy's first-set RIR before history arrives.
    await user.click(screen.getAllByLabelText('Increase RIR for set 1')[1]);
    await user.click(screen.getAllByLabelText('Increase RIR for set 1')[1]);
    await act(async () => { resolveHistory([twoOccurrences()]); });

    expect(screen.getByLabelText('Set 1 RIR 3')).toBeInTheDocument();
    expect(screen.getByText('5 × 225 lb')).toBeInTheDocument();
    expect(screen.getByText('15 × 135 lb')).toBeInTheDocument();
    expect(screen.queryByText('12 × 145 lb')).not.toBeInTheDocument();
  });

  it('keeps duplicate seeds eligible after a remount and protects the edited copy', async () => {
    const user = userEvent.setup();
    repo.getWorkoutHistory.mockImplementationOnce(() => new Promise(() => {}));
    repo.getWeeklyRoutines.mockResolvedValue(duplicateRoutine());
    const first = renderTraining();
    await screen.findAllByText('Bench Press');
    await user.click(screen.getAllByLabelText('Increase RIR for set 1')[1]);
    await user.click(screen.getAllByLabelText('Increase RIR for set 1')[1]);
    first.unmount();

    localStorage.removeItem(`fac-prefilled-v1:user-abc:${format(new Date(), 'yyyy-MM-dd')}`);
    repo.getWorkoutHistory.mockResolvedValue([twoOccurrences()]);
    renderTraining();

    expect(await screen.findByLabelText('Set 1 RIR 3')).toBeInTheDocument();
    expect(screen.getByText('5 × 225 lb')).toBeInTheDocument();
    expect(screen.getByText('15 × 135 lb')).toBeInTheDocument();
  });

  it('keeps a delayed-history edit when an earlier duplicate is removed', async () => {
    const user = userEvent.setup();
    let resolveHistory!: (value: ReturnType<typeof session>[]) => void;
    repo.getWorkoutHistory.mockImplementationOnce(
      () => new Promise((resolve) => { resolveHistory = resolve; }),
    );
    repo.getWeeklyRoutines.mockResolvedValue(duplicateRoutine());
    renderTraining();
    await screen.findAllByText('Bench Press');

    // Edit the second copy (back-off) while history is still loading.
    await user.click(screen.getAllByLabelText('Increase RIR for set 1')[1]);
    await user.click(screen.getAllByLabelText('Increase RIR for set 1')[1]);
    expect(screen.getByLabelText('Set 1 RIR 3')).toBeInTheDocument();

    // Removing the first copy renumbers the survivor from occurrence 1 to 0.
    await user.click(screen.getAllByLabelText('Remove Bench Press')[0]);
    expect(screen.getAllByText('Bench Press')).toHaveLength(1);
    expect(screen.getByText('15 × 135 lb')).toBeInTheDocument();
    // The persisted guard moves with the survivor instead of going stale.
    const markers = JSON.parse(
      localStorage.getItem(`fac-prefilled-v1:user-abc:${format(new Date(), 'yyyy-MM-dd')}`) ?? '[]',
    ) as string[];
    expect([...markers].sort()).toEqual(['bench-press#0']);

    await act(async () => { resolveHistory([twoOccurrences()]); });

    // The survivor was edited, so its renumbered slot must stay protected.
    expect(screen.getByLabelText('Set 1 RIR 3')).toBeInTheDocument();
    expect(screen.getByText('15 × 135 lb')).toBeInTheDocument();
    expect(screen.queryByText('5 × 225 lb')).not.toBeInTheDocument();
  });

  it('preserves the survivor edit through removal when localStorage writes fail', async () => {
    const user = userEvent.setup();
    const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    try {
      let resolveHistory!: (value: ReturnType<typeof session>[]) => void;
      repo.getWorkoutHistory.mockImplementationOnce(
        () => new Promise((resolve) => { resolveHistory = resolve; }),
      );
      repo.getWeeklyRoutines.mockResolvedValue(duplicateRoutine());
      renderTraining();
      await screen.findAllByText('Bench Press');

      await user.click(screen.getAllByLabelText('Increase RIR for set 1')[1]);
      await user.click(screen.getAllByLabelText('Increase RIR for set 1')[1]);
      await user.click(screen.getAllByLabelText('Remove Bench Press')[0]);

      await act(async () => { resolveHistory([twoOccurrences()]); });

      // The in-memory guard is rebased with the slot even though the marker
      // could not be persisted.
      expect(screen.getByLabelText('Set 1 RIR 3')).toBeInTheDocument();
      expect(screen.getByText('15 × 135 lb')).toBeInTheDocument();
      expect(screen.queryByText('5 × 225 lb')).not.toBeInTheDocument();
    } finally {
      storage.mockRestore();
    }
  });

  it('still prefills the untouched survivor when an untouched first copy is removed', async () => {
    const user = userEvent.setup();
    let resolveHistory!: (value: ReturnType<typeof session>[]) => void;
    repo.getWorkoutHistory.mockImplementationOnce(
      () => new Promise((resolve) => { resolveHistory = resolve; }),
    );
    repo.getWeeklyRoutines.mockResolvedValue(duplicateRoutine());
    renderTraining();
    await screen.findAllByText('Bench Press');

    await user.click(screen.getAllByLabelText('Remove Bench Press')[0]);
    expect(screen.getByText('15 × 135 lb')).toBeInTheDocument();

    await act(async () => { resolveHistory([twoOccurrences()]); });

    // Nothing was edited, so the remaining copy is still eligible and now
    // matches the first occurrence.
    expect(await screen.findByText('5 × 225 lb')).toBeInTheDocument();
  });

  it('prefills an untouched survivor when the edited first copy is removed', async () => {
    const user = userEvent.setup();
    let resolveHistory!: (value: ReturnType<typeof session>[]) => void;
    repo.getWorkoutHistory.mockImplementationOnce(
      () => new Promise((resolve) => { resolveHistory = resolve; }),
    );
    repo.getWeeklyRoutines.mockResolvedValue(duplicateRoutine());
    renderTraining();
    await screen.findAllByText('Bench Press');

    await user.click(screen.getAllByLabelText('Increase RIR for set 1')[0]);
    await user.click(screen.getAllByLabelText('Increase RIR for set 1')[0]);
    expect(screen.getByLabelText('Set 1 RIR 3')).toBeInTheDocument();

    await user.click(screen.getAllByLabelText('Remove Bench Press')[0]);
    expect(screen.getByText('15 × 135 lb')).toBeInTheDocument();

    await act(async () => { resolveHistory([twoOccurrences()]); });

    // The edit left with the removed copy; the marker must not suppress the
    // untouched copy that inherited occurrence 0.
    expect(await screen.findByText('5 × 225 lb')).toBeInTheDocument();
    expect(screen.queryByLabelText('Set 1 RIR 3')).not.toBeInTheDocument();
  });

  it('keeps an untouched survivor eligible after removal and remount', async () => {
    const user = userEvent.setup();
    repo.getWorkoutHistory.mockImplementationOnce(() => new Promise(() => {}));
    repo.getWeeklyRoutines.mockResolvedValue(duplicateRoutine());
    const first = renderTraining();
    await screen.findAllByText('Bench Press');

    await user.click(screen.getAllByLabelText('Remove Bench Press')[0]);
    first.unmount();

    repo.getWorkoutHistory.mockResolvedValue([twoOccurrences()]);
    renderTraining();

    expect(await screen.findByText('5 × 225 lb')).toBeInTheDocument();
  });

  it('offers one shared finish decision from the first copy and records that suggestion', async () => {
    const user = userEvent.setup();
    repo.getWeeklyRoutines.mockResolvedValue(duplicateRoutine());
    repo.getWorkoutHistory.mockResolvedValue([twoOccurrences()]);
    renderTraining();
    await screen.findByText('5 × 225 lb');

    await user.click(screen.getByRole('button', { name: /finish workout/i }));
    expect(screen.getByText(/Bench Press: 5 × 230/)).toBeInTheDocument();
    expect(screen.getByText(/applies to all 2 copies/i)).toBeInTheDocument();
    expect(screen.queryByText('Bench Press: 13 × 145')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Accept' })).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Accept' }));
    await user.click(screen.getByRole('button', { name: 'Finish' }));

    await waitFor(() => expect(overloadMock.recordOverloadDecision).toHaveBeenCalledTimes(1));
    expect(overloadMock.recordOverloadDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        exerciseId: 'bench-press',
        workoutDate: format(new Date(), 'yyyy-MM-dd'),
        decision: 'accept',
        suggestedReps: 5,
        suggestedWeight: 230,
      }),
    );
  });

  it('keeps current targets when the newest session has the copy but no completed working sets', async () => {
    const newest = twoOccurrences();
    newest.exercises[1].sets = [{ reps: 12, weight: 45, rir: null, completed: true, setType: 'warmup' }];
    const older = session(
      [[{ reps: 5, weight: 205, rir: 1 }], [{ reps: 12, weight: 115, rir: 2 }]],
      '2020-01-01',
    );
    repo.getWeeklyRoutines.mockResolvedValue(duplicateRoutine());
    repo.getWorkoutHistory.mockResolvedValue([newest, older]);
    renderTraining();

    expect(await screen.findByText('5 × 225 lb')).toBeInTheDocument();
    expect(screen.getByText('15 × 135 lb')).toBeInTheDocument();
    expect(screen.queryByText('12 × 115 lb')).not.toBeInTheDocument();
    expect(screen.getAllByText(/Last time:/)).toHaveLength(1);
  });
});
