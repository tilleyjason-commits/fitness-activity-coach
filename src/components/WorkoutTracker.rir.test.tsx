import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkoutTracker } from './WorkoutTracker';
import type { WorkoutExercise } from '~/lib/types';
import type { PastSet } from '~/lib/workout-mappers';

/**
 * RIR is judged per set at the moment the set ends, so the stepper stays on
 * the row — reachable before completion, after completion, and without
 * opening the editor sheet.
 */

const onLogSet = vi.fn();
const onSetRir = vi.fn();
const onRemoveExercise = vi.fn();
const onRemoveCardioExercise = vi.fn();

function makeExercise(overrides: Partial<WorkoutExercise> = {}): WorkoutExercise {
  return {
    exercise: { id: 'rdl', name: 'Romanian Deadlift', muscleGroup: 'Hamstrings' },
    targetSets: 2,
    targetReps: 8,
    targetWeight: 160,
    sets: [
      { reps: 8, weight: 160, rir: null, completed: false },
      { reps: 8, weight: 160, rir: null, completed: false },
    ],
    ...overrides,
  };
}

function renderTracker(
  exercises: WorkoutExercise[],
  pastByExerciseId?: Record<string, PastSet[]>,
) {
  return render(
    <WorkoutTracker
      exercises={exercises}
      cardioExercises={[]}
      onLogSet={onLogSet}
      onSetRir={onSetRir}
      onRemoveExercise={onRemoveExercise}
      onRemoveCardioExercise={onRemoveCardioExercise}
      pastByExerciseId={pastByExerciseId}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('per-set RIR stepper', () => {
  it('lands on the default RIR from an unset value instead of jumping to zero', async () => {
    const user = userEvent.setup();
    renderTracker([makeExercise()]);

    await user.click(screen.getByRole('button', { name: 'Increase RIR for set 1' }));

    expect(onSetRir).toHaveBeenCalledWith(0, 0, 2);
  });

  it('steps an existing value up and down without completing the set', async () => {
    const user = userEvent.setup();
    renderTracker([
      makeExercise({
        sets: [
          { reps: 8, weight: 160, rir: 2, completed: false },
          { reps: 8, weight: 160, rir: null, completed: false },
        ],
      }),
    ]);

    await user.click(screen.getByRole('button', { name: 'Increase RIR for set 1' }));
    await user.click(screen.getByRole('button', { name: 'Decrease RIR for set 1' }));

    expect(onSetRir).toHaveBeenNthCalledWith(1, 0, 0, 3);
    expect(onSetRir).toHaveBeenNthCalledWith(2, 0, 0, 1);
    expect(onLogSet).not.toHaveBeenCalled();
  });

  it('stays editable after the set is completed', async () => {
    const user = userEvent.setup();
    renderTracker([
      makeExercise({
        sets: [
          { reps: 8, weight: 160, rir: 1, completed: true },
          { reps: 8, weight: 160, rir: null, completed: false },
        ],
      }),
    ]);

    await user.click(screen.getByRole('button', { name: 'Decrease RIR for set 1' }));

    expect(onSetRir).toHaveBeenCalledWith(0, 0, 0);
  });

  it('clamps at the 0 floor', async () => {
    const user = userEvent.setup();
    renderTracker([
      makeExercise({
        sets: [
          { reps: 8, weight: 160, rir: 0, completed: true },
          { reps: 8, weight: 160, rir: null, completed: false },
        ],
      }),
    ]);

    await user.click(screen.getByRole('button', { name: 'Decrease RIR for set 1' }));

    expect(onSetRir).toHaveBeenCalledWith(0, 0, 0);
  });

  it('gives both stepper controls a 44px vertical hit target', () => {
    renderTracker([makeExercise()]);

    expect(screen.getByRole('button', { name: 'Decrease RIR for set 1' }).className).toMatch(
      /min-h-11/,
    );
    expect(screen.getByRole('button', { name: 'Increase RIR for set 1' }).className).toMatch(
      /min-h-11/,
    );
  });
});

describe('last-time overload reference', () => {
  it('shows the prior session set matching the set about to be worked', () => {
    renderTracker(
      [
        makeExercise({
          sets: [
            { reps: 8, weight: 160, rir: 2, completed: true },
            { reps: 8, weight: 160, rir: null, completed: false },
          ],
        }),
      ],
      {
        rdl: [
          { reps: 8, weight: 155, rir: 2 },
          { reps: 7, weight: 155, rir: 1 },
        ],
      },
    );

    expect(screen.getByText(/last time: 7 × 155 lb · rir 1/i)).toBeInTheDocument();
  });

  it('stays silent when the exercise has no prior session', () => {
    renderTracker([makeExercise()]);

    expect(screen.queryByText(/last time/i)).not.toBeInTheDocument();
  });
});

describe('completed exercise collapsing', () => {
  it('collapses a fully completed exercise and reopens it on tap', async () => {
    const user = userEvent.setup();
    renderTracker([
      makeExercise({
        sets: [
          { reps: 8, weight: 160, rir: 2, completed: true },
          { reps: 8, weight: 160, rir: 1, completed: true },
        ],
      }),
    ]);

    expect(
      screen.queryByRole('button', { name: 'Increase RIR for set 1' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { expanded: false }));

    expect(screen.getByRole('button', { name: 'Increase RIR for set 1' })).toBeInTheDocument();
  });

  it('keeps an in-progress exercise expanded', () => {
    renderTracker([
      makeExercise({
        sets: [
          { reps: 8, weight: 160, rir: 2, completed: true },
          { reps: 8, weight: 160, rir: null, completed: false },
        ],
      }),
    ]);

    expect(screen.getByRole('button', { name: 'Increase RIR for set 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /complete set 2/i })).toBeInTheDocument();
  });
});
