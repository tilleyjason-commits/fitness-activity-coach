import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ExerciseSelector } from '~/components/ExerciseSelector';

function renderSelector() {
  const onAdd = vi.fn();
  const onAddCardio = vi.fn();
  render(<ExerciseSelector onAdd={onAdd} onAddCardio={onAddCardio} />);
  return { onAdd, onAddCardio };
}

describe('ExerciseSelector commercial-gym catalog', () => {
  it('searches the full library and filters it by equipment', async () => {
    const user = userEvent.setup();
    renderSelector();

    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');

    await user.type(screen.getByLabelText('Search exercises'), 'bench press');
    await user.selectOptions(screen.getByLabelText('Equipment'), 'Dumbbell');

    expect(
      screen.getByRole('button', { name: /^Dumbbell Bench Press Dumbbell · Chest$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Incline Dumbbell Bench Press Dumbbell · Chest$/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Chest Press Machine/i })).not.toBeInTheDocument();
  });

  it('adds a filtered free-weight exercise with its equipment metadata', async () => {
    const user = userEvent.setup();
    const { onAdd, onAddCardio } = renderSelector();

    await user.type(screen.getByLabelText('Search exercises'), 'barbell back squat');
    await user.click(screen.getByRole('button', { name: /Barbell Back Squat/i }));
    await user.click(screen.getByRole('button', { name: 'Add to Workout' }));

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'barbell-back-squat',
        name: 'Barbell Back Squat',
        muscleGroup: 'Legs',
        equipment: 'Barbell',
      }),
      3,
      10,
      50,
    );
    expect(onAddCardio).not.toHaveBeenCalled();
  });
});
