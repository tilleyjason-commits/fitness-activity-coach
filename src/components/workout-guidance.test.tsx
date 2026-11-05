import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { FocusWorkout } from './FocusWorkout';
import { WorkoutTracker } from './WorkoutTracker';
import { createWorkoutExercise } from '~/lib/workout-mappers';
import type { PastSet } from '~/lib/workout-mappers';

/**
 * Warm-up and duplicate-exercise guidance.
 *
 * Prior-session guidance compares working set to working set (warm-ups have no
 * reference) and, when an exercise appears twice in one workout, first copy to
 * first copy and second copy to second copy. A copy with no counterpart in the
 * most recent matching session gets no hint rather than the other copy's.
 */

const bench = { id: 'bench', name: 'Bench Press', muscleGroup: 'Chest' };
const past: PastSet[] = [
  { reps: 8, weight: 185, rir: 2 },
  { reps: 5, weight: 205, rir: 1 },
];

function warmupExercise(warmupDone: boolean) {
  const result = createWorkoutExercise(bench, 3, 8, 185);
  result.sets[0] = { reps: 12, weight: 45, rir: null, completed: warmupDone, setType: 'warmup' };
  return result;
}

function renderFocus(exercises: ReturnType<typeof warmupExercise>[], index: number, pastBySlot: Record<string, PastSet[]>) {
  return render(
    <FocusWorkout
      exercises={exercises}
      index={index}
      onIndex={vi.fn()}
      onLogSet={vi.fn()}
      onNote={vi.fn()}
      pastBySlot={pastBySlot}
    />,
  );
}

function renderTracker(
  exercises: ReturnType<typeof warmupExercise>[],
  pastBySlot: Record<string, PastSet[]>,
) {
  return render(
    <WorkoutTracker
      exercises={exercises}
      cardioExercises={[]}
      onLogSet={vi.fn()}
      onRemoveExercise={vi.fn()}
      onRemoveCardioExercise={vi.fn()}
      pastBySlot={pastBySlot}
    />,
  );
}

afterEach(cleanup);

describe('warm-up guidance', () => {
  it('shows no working-set history while the warm-up is the active set', () => {
    renderFocus([warmupExercise(false)], 0, { 'bench#0': past });
    expect(screen.queryByText(/Last time:/)).not.toBeInTheDocument();
  });

  it('compares the first working set with the first prior working set after a warm-up', () => {
    renderFocus([warmupExercise(true)], 0, { 'bench#0': past });
    expect(screen.getByText(/Last time:/)).toHaveTextContent('Last time: 8 × 185 lb');
    expect(screen.getByRole('button', { name: 'Complete set 2' })).toBeInTheDocument();
  });
});

describe('duplicate-exercise guidance', () => {
  const topSet = () => createWorkoutExercise(bench, 1, 5, 225);
  const backoff = () => createWorkoutExercise(bench, 1, 15, 135);
  const pastBySlot: Record<string, PastSet[]> = {
    'bench#0': [{ reps: 5, weight: 225, rir: 1 }],
    'bench#1': [{ reps: 15, weight: 135, rir: 2 }],
  };

  it('list mode gives each copy its own prior working set', () => {
    renderTracker([topSet(), backoff()], pastBySlot);
    const hints = screen.getAllByText(/Last time:/).map((element) => element.textContent);
    expect(hints).toEqual(['Last time: 5 × 225 lb · RIR 1', 'Last time: 15 × 135 lb · RIR 2']);
  });

  it('focus mode gives the selected copy its own prior working set', () => {
    renderFocus([topSet(), backoff()], 1, pastBySlot);
    expect(screen.getByText(/Last time:/)).toHaveTextContent('Last time: 15 × 135 lb');
  });

  it('shows no hint for a copy with no matching prior occurrence', () => {
    renderTracker([topSet(), backoff()], { 'bench#0': pastBySlot['bench#0'] });
    const hints = screen.getAllByText(/Last time:/);
    expect(hints).toHaveLength(1);
    expect(hints[0]).toHaveTextContent('Last time: 5 × 225 lb');
  });
});
