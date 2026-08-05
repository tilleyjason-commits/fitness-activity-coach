import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkoutTracker } from './WorkoutTracker';
import type { WorkoutExercise } from '~/lib/types';

/**
 * The most frequent gym action — marking a set done — must be a single
 * explicit tap, not a hidden double-click. Editing gets its own visible
 * control that opens the logger sheet.
 */

const onLogSet = vi.fn();
const onRemoveExercise = vi.fn();
const onRemoveCardioExercise = vi.fn();

function makeExercise(overrides: Partial<WorkoutExercise> = {}): WorkoutExercise {
  return {
    exercise: { id: 'leg-press', name: 'Leg Press', muscleGroup: 'Quads' },
    targetSets: 2,
    targetReps: 10,
    targetWeight: 90,
    sets: [
      { reps: 10, weight: 90, rir: null, completed: false },
      { reps: 10, weight: 90, rir: null, completed: false },
    ],
    ...overrides,
  };
}

function renderTracker(
  exercises: WorkoutExercise[],
  pastByExerciseId?: Record<string, { reps: number; weight: number; rir: number | null }[]>,
) {
  return render(
    <WorkoutTracker
      exercises={exercises}
      cardioExercises={[]}
      onLogSet={onLogSet}
      onRemoveExercise={onRemoveExercise}
      onRemoveCardioExercise={onRemoveCardioExercise}
      pastByExerciseId={pastByExerciseId}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('quick-complete set tiles', () => {
  it('completes a set with its target/current values on a single tap, without opening the sheet', async () => {
    const user = userEvent.setup();
    renderTracker([makeExercise()]);

    await user.click(screen.getByRole('button', { name: /complete set 1/i }));

    expect(onLogSet).toHaveBeenCalledTimes(1);
    expect(onLogSet).toHaveBeenCalledWith(0, 0, 10, 90, null);
    expect(screen.queryByRole('dialog', { name: 'Log set' })).not.toBeInTheDocument();
  });

  it('opens the logger sheet from the explicit edit control instead', async () => {
    const user = userEvent.setup();
    renderTracker([makeExercise()]);

    await user.click(screen.getByRole('button', { name: /edit set 1/i }));

    expect(onLogSet).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: 'Log set' });
    expect(dialog).toBeInTheDocument();
  });

  it('opens the editor (not a re-complete) when tapping an already completed set', async () => {
    const user = userEvent.setup();
    const exercise = makeExercise({
      sets: [
        { reps: 8, weight: 95, rir: 2, completed: true },
        { reps: 10, weight: 90, rir: null, completed: false },
      ],
    });
    renderTracker([exercise]);

    await user.click(screen.getByRole('button', { name: /set 1 completed/i }));

    expect(onLogSet).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Log set' })).toBeInTheDocument();
  });

  it('logs the edited values through the sheet', async () => {
    const user = userEvent.setup();
    renderTracker([makeExercise()]);

    await user.click(screen.getByRole('button', { name: /edit set 2/i }));
    await user.click(screen.getByRole('button', { name: 'Increase reps' }));
    await user.click(screen.getByRole('button', { name: 'Log Set' }));

    expect(onLogSet).toHaveBeenCalledWith(0, 1, 11, 90, 2);
  });

  it('meets the 44px floor on quick-complete and edit controls', () => {
    renderTracker([makeExercise()]);
    const complete = screen.getByRole('button', { name: /complete set 1/i });
    const edit = screen.getByRole('button', { name: /edit set 1/i });
    expect(complete.className).toMatch(/min-h-11/);
    expect(edit.className).toMatch(/min-h-11/);
    expect(edit.className).toMatch(/min-w-11/);
  });
});

describe('progressive-overload "beat last" chip', () => {
  it('shows a beat-last suggestion and applies it on tap', async () => {
    const user = userEvent.setup();
    renderTracker([makeExercise()], {
      'leg-press': [{ reps: 10, weight: 90, rir: 2 }],
    });

    await user.click(screen.getByRole('button', { name: /edit set 1/i }));
    expect(screen.getByText(/beat last: 10 × 90 lb/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /beat last/i }));
    await user.click(screen.getByRole('button', { name: 'Log Set' }));

    // RIR here is the sheet's own default (unrelated set has no RIR logged yet) —
    // the chip only overrides reps/weight, per suggestNextSet's contract.
    expect(onLogSet).toHaveBeenCalledWith(0, 0, 11, 90, 2);
  });

  it('suggests a weight step instead of another rep once last time hit failure', async () => {
    const user = userEvent.setup();
    renderTracker([makeExercise()], {
      'leg-press': [{ reps: 10, weight: 90, rir: 0 }],
    });

    await user.click(screen.getByRole('button', { name: /edit set 1/i }));
    await user.click(screen.getByRole('button', { name: /beat last/i }));
    await user.click(screen.getByRole('button', { name: 'Log Set' }));

    expect(onLogSet).toHaveBeenCalledWith(0, 0, 10, 95, 2);
  });

  it('shows no suggestion without a prior session for this exercise', async () => {
    const user = userEvent.setup();
    renderTracker([makeExercise()]);

    await user.click(screen.getByRole('button', { name: /edit set 1/i }));
    expect(screen.queryByText(/beat last/i)).not.toBeInTheDocument();
  });
});
