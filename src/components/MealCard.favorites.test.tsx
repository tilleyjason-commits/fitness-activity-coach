import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MealCard } from '~/components/MealCard';
import type { FavoriteFood, MealFavorite } from '~/lib/meal-favorites';
import type { MealFood, MealLog } from '~/lib/types';

/**
 * Meal favorites/recents are a one-tap re-log path so daily use doesn't
 * depend on the AI (rate-limited) or retyping the same meal from scratch.
 */

const onCalculate = vi.fn();
const onSave = vi.fn();
const onClear = vi.fn();
const onToggleFavorite = vi.fn();

const sampleFoods: FavoriteFood[] = [
  {
    food_name: 'Greek yogurt',
    quantity: 1,
    unit: 'cup',
    calories: 150,
    protein_g: 20,
    carbs_g: 8,
    fat_g: 4,
    confidence: 'high',
  },
];

function makeFavorite(overrides: Partial<MealFavorite> = {}): MealFavorite {
  return {
    id: 'fav-1',
    slot: 'lunch',
    label: 'Greek yogurt bowl',
    mealTime: '12:00',
    foods: sampleFoods,
    createdAt: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('quick-add chips (favorites + recents)', () => {
  it('shows a favorite chip on the collapsed empty slot and logs it in one tap', async () => {
    const user = userEvent.setup();
    render(
      <MealCard
        slot="lunch"
        mealLog={null}
        foods={[]}
        onCalculate={onCalculate}
        onSave={onSave}
        onClear={onClear}
        favorites={[makeFavorite()]}
      />,
    );

    onSave.mockResolvedValue(undefined);
    await user.click(screen.getByRole('button', { name: /greek yogurt bowl/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const [slot, input] = onSave.mock.calls[0];
    expect(slot).toBe('lunch');
    expect(input.rawInput).toBe('Greek yogurt bowl');
    expect(input.foods).toEqual(sampleFoods);
    // Never touches the AI edge function for a quick-add.
    expect(onCalculate).not.toHaveBeenCalled();
  });

  it('shows a recent-meal chip distinct from favorites and logs it in one tap', async () => {
    const user = userEvent.setup();
    render(
      <MealCard
        slot="dinner"
        mealLog={null}
        foods={[]}
        onCalculate={onCalculate}
        onSave={onSave}
        onClear={onClear}
        recents={[{ label: 'Salmon and rice', mealTime: '18:30', foods: sampleFoods }]}
      />,
    );

    onSave.mockResolvedValue(undefined);
    await user.click(screen.getByRole('button', { name: /salmon and rice/i }));

    expect(onSave).toHaveBeenCalledWith('dinner', {
      rawInput: 'Salmon and rice',
      mealTime: '18:30',
      foods: sampleFoods,
    });
  });

  it('does not duplicate a meal that is both a favorite and a recent', async () => {
    render(
      <MealCard
        slot="lunch"
        mealLog={null}
        foods={[]}
        onCalculate={onCalculate}
        onSave={onSave}
        onClear={onClear}
        favorites={[makeFavorite({ label: 'Same meal' })]}
        recents={[{ label: 'Same meal', mealTime: '12:00', foods: sampleFoods }]}
      />,
    );

    expect(screen.getAllByRole('button', { name: /same meal/i })).toHaveLength(1);
  });

  it('shows no quick-add row when there are no favorites or recents', () => {
    render(
      <MealCard
        slot="lunch"
        mealLog={null}
        foods={[]}
        onCalculate={onCalculate}
        onSave={onSave}
        onClear={onClear}
      />,
    );

    expect(screen.queryByRole('group', { name: /quick add/i })).not.toBeInTheDocument();
  });
});

describe('favorite toggle on a saved meal', () => {
  const savedLog: MealLog = {
    id: 'meal-1',
    daily_log_id: 'dl-1',
    meal_slot: 'lunch',
    meal_time: '12:00:00',
    raw_input: 'Greek yogurt bowl',
    total_calories: 150,
    total_protein_g: 20,
    total_carbs_g: 8,
    total_fat_g: 4,
    created_at: '2026-08-01T00:00:00Z',
  };
  const savedFoods: MealFood[] = [
    {
      id: 'food-1',
      meal_log_id: 'meal-1',
      food_name: 'Greek yogurt',
      quantity: 1,
      unit: 'cup',
      calories: 150,
      protein_g: 20,
      carbs_g: 8,
      fat_g: 4,
      confidence: 'high',
      created_at: '2026-08-01T00:00:00Z',
    },
  ];

  it('lets the user star a saved meal as a favorite', async () => {
    const user = userEvent.setup();
    render(
      <MealCard
        slot="lunch"
        mealLog={savedLog}
        foods={savedFoods}
        onCalculate={onCalculate}
        onSave={onSave}
        onClear={onClear}
        isFavorited={false}
        onToggleFavorite={onToggleFavorite}
      />,
    );

    const star = screen.getByRole('button', { name: /save as favorite/i });
    expect(star).toHaveAttribute('aria-pressed', 'false');
    await user.click(star);
    expect(onToggleFavorite).toHaveBeenCalledTimes(1);
  });

  it('shows an already-favorited meal as pressed with a remove label', () => {
    render(
      <MealCard
        slot="lunch"
        mealLog={savedLog}
        foods={savedFoods}
        onCalculate={onCalculate}
        onSave={onSave}
        onClear={onClear}
        isFavorited
        onToggleFavorite={onToggleFavorite}
      />,
    );

    const star = screen.getByRole('button', { name: /remove from favorites/i });
    expect(star).toHaveAttribute('aria-pressed', 'true');
  });

  it('hides the favorite star when no toggle handler is provided', () => {
    render(
      <MealCard
        slot="lunch"
        mealLog={savedLog}
        foods={savedFoods}
        onCalculate={onCalculate}
        onSave={onSave}
        onClear={onClear}
      />,
    );

    expect(screen.queryByRole('button', { name: /favorite/i })).not.toBeInTheDocument();
  });
});
