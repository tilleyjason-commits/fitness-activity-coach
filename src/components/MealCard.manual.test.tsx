import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MealCard } from '~/components/MealCard';
import type { MacrosFromAI } from '~/lib/types';

/**
 * Product decision: manual macro entry must remain available when AI fails.
 * A provider outage may not clear user-entered food or macro values, and the
 * failure must be visible and actionable.
 */

const onCalculate = vi.fn();
const onSave = vi.fn();
const onClear = vi.fn();

function renderCard() {
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
}

describe('MealCard Bedtime Snack slot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderBedtimeCard() {
    render(
      <MealCard
        slot="bedtime_snack"
        mealLog={null}
        foods={[]}
        onCalculate={onCalculate}
        onSave={onSave}
        onClear={onClear}
      />,
    );
  }

  it('renders an accessible Bedtime Snack section defaulting to 20:00 with the approved hint', async () => {
    const user = userEvent.setup();
    renderBedtimeCard();

    expect(screen.getByRole('region', { name: 'Bedtime Snack' })).toBeInTheDocument();
    // The empty slot is a compact row; the hint shows there, the full editor after a tap.
    expect(screen.getByText('Pre-sleep protein / casein (~20:00)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add Bedtime Snack' }));
    expect(screen.getByLabelText('Bedtime Snack time')).toHaveValue('20:00');
  });

  it('supports manual food entry and save without ever invoking the AI', async () => {
    const user = userEvent.setup();
    renderBedtimeCard();

    await user.click(screen.getByRole('button', { name: 'Add Bedtime Snack' }));
    await user.click(screen.getByRole('button', { name: /add food manually/i }));
    await user.type(screen.getByLabelText(/food name/i), 'Casein shake');
    await user.type(screen.getByLabelText(/^cal$/i), '120');
    await user.type(screen.getByLabelText(/^p \(g\)$/i), '24');

    onSave.mockResolvedValue(undefined);
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onCalculate).not.toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledTimes(1);
    const [slot, input] = onSave.mock.calls[0];
    expect(slot).toBe('bedtime_snack');
    expect(input.foods).toHaveLength(1);
    expect(input.foods[0].food_name).toBe('Casein shake');
    expect(input.foods[0].calories).toBe(120);
    expect(input.foods[0].protein_g).toBe(24);
  });
});

describe('MealCard manual entry when AI is unavailable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lets the user add a food manually without ever calling the AI', async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole('button', { name: 'Add Lunch' }));
    await user.click(screen.getByRole('button', { name: /add food manually/i }));

    await user.type(screen.getByLabelText(/food name/i), 'Turkey sandwich');
    await user.type(screen.getByLabelText(/^cal$/i), '450');
    await user.type(screen.getByLabelText(/^p \(g\)$/i), '30');

    onSave.mockResolvedValue(undefined);
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onCalculate).not.toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledTimes(1);
    const [, input] = onSave.mock.calls[0];
    expect(input.foods).toHaveLength(1);
    expect(input.foods[0].food_name).toBe('Turkey sandwich');
    expect(input.foods[0].calories).toBe(450);
    expect(input.foods[0].protein_g).toBe(30);
  });

  it('shows the AI failure, preserves the description, and still allows manual entry and save', async () => {
    const user = userEvent.setup();
    onCalculate.mockRejectedValue(new Error('The AI provider is temporarily unavailable.'));
    renderCard();

    await user.click(screen.getByRole('button', { name: 'Add Lunch' }));
    await user.type(screen.getByLabelText(/lunch description/i), 'chicken wrap and an apple');
    await user.click(screen.getByRole('button', { name: /calculate with ai/i }));

    // Visible, actionable error.
    expect(await screen.findByText(/temporarily unavailable/i)).toBeInTheDocument();

    // Recover into manual entry without losing the description.
    await user.click(screen.getByRole('button', { name: /add food manually/i }));
    expect(screen.getByLabelText(/lunch description/i)).toHaveValue('chicken wrap and an apple');

    await user.type(screen.getByLabelText(/food name/i), 'Chicken wrap');
    await user.type(screen.getByLabelText(/^cal$/i), '520');

    onSave.mockResolvedValue(undefined);
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const [, input] = onSave.mock.calls[0];
    expect(input.rawInput).toBe('chicken wrap and an apple');
    expect(input.foods[0].food_name).toBe('Chicken wrap');
  });

  it('keeps AI-calculated drafts when a later recalculation fails', async () => {
    const user = userEvent.setup();
    const firstResult: MacrosFromAI = {
      foods: [
        {
          food_name: 'Apple',
          quantity: 1,
          unit: 'medium',
          calories: 95,
          protein_g: 0.5,
          carbs_g: 25,
          fat_g: 0.3,
          confidence: 'high',
        },
      ],
      meal_total: { calories: 95, protein_g: 0.5, carbs_g: 25, fat_g: 0.3 },
    };
    onCalculate.mockResolvedValueOnce(firstResult);
    renderCard();

    await user.click(screen.getByRole('button', { name: 'Add Lunch' }));
    await user.type(screen.getByLabelText(/lunch description/i), 'an apple');
    await user.click(screen.getByRole('button', { name: /calculate with ai/i }));
    expect(await screen.findByDisplayValue('Apple')).toBeInTheDocument();

    onCalculate.mockRejectedValueOnce(new Error('NVIDIA API request failed (429)'));
    await user.click(screen.getByRole('button', { name: /calculate with ai/i }));
    expect(await screen.findByText(/failed \(429\)/i)).toBeInTheDocument();

    // The previously calculated draft survives the failure.
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(screen.getByDisplayValue('Apple')).toBeInTheDocument();
  });

  it('shows a visible notice when the AI response used DeepSeek fallback', async () => {
    const user = userEvent.setup();
    const fallbackResult: MacrosFromAI = {
      foods: [
        {
          food_name: 'Banana',
          quantity: 1,
          unit: 'medium',
          calories: 105,
          protein_g: 1.3,
          carbs_g: 27,
          fat_g: 0.4,
          confidence: 'high',
        },
      ],
      meal_total: { calories: 105, protein_g: 1.3, carbs_g: 27, fat_g: 0.4 },
      provider: 'deepseek',
      model: 'deepseek-chat',
      fallback: true,
      fallback_reason: 'NVIDIA is rate-limiting requests.',
    };
    onCalculate.mockResolvedValueOnce(fallbackResult);
    renderCard();

    await user.click(screen.getByRole('button', { name: 'Add Lunch' }));
    await user.type(screen.getByLabelText(/lunch description/i), 'one banana');
    await user.click(screen.getByRole('button', { name: /calculate with ai/i }));

    // User-facing copy first; vendor detail stays available in the disclosure.
    expect(await screen.findByRole('status')).toHaveTextContent(/Backup AI estimated these macros/i);
    expect(screen.getByRole('status')).toHaveTextContent(/deepseek-chat/i);
    expect(screen.getByDisplayValue('Banana')).toBeInTheDocument();
  });
});
