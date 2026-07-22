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

function renderTracker(exercises: WorkoutExercise[]) {
  return render(
    <WorkoutTracker
      exercises={exercises}
      cardioExercises={[]}
      onLogSet={onLogSet}
      onRemoveExercise={onRemoveExercise}
      onRemoveCardioExercise={onRemoveCardioExercise}
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
