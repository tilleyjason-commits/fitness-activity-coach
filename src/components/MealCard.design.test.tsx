import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MealCard } from '~/components/MealCard';
import type { MacrosFromAI, MealFood, MealLog } from '~/lib/types';

/**
 * Kitchen-surface polish: lucide slot icons (no platform-dependent emoji),
 * empty slots collapse to one-line rows, and the provider fallback stays
 * visible but speaks to the user first and keeps vendor detail behind a tap.
 */

const onCalculate = vi.fn();
const onSave = vi.fn();
const onClear = vi.fn();

function renderSlot(slot: 'breakfast' | 'lunch', mealLog: MealLog | null = null, foods: MealFood[] = []) {
  return render(
    <MealCard
      slot={slot}
      mealLog={mealLog}
      foods={foods}
      onCalculate={onCalculate}
      onSave={onSave}
      onClear={onClear}
    />,
  );
}

function savedBreakfast(): MealLog {
  return {
    id: 'm-1',
    daily_log_id: 'dl-1',
    meal_slot: 'breakfast',
    meal_time: '07:30',
    raw_input: 'oatmeal',
    total_calories: 400,
    total_protein_g: 30,
    total_carbs_g: 40,
    total_fat_g: 10,
    created_at: '2026-01-01T00:00:00Z',
  } as MealLog;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('lucide slot icons', () => {
  it('renders a lucide icon for the slot instead of an emoji', () => {
    const { container } = renderSlot('breakfast');
    expect(container.querySelector('svg.lucide-sunrise')).toBeInTheDocument();
    expect(container.textContent).not.toContain('🌅');
  });
});

describe('compact empty slots', () => {
  it('collapses an empty slot to a one-line row and expands on tap', async () => {
    const user = userEvent.setup();
    renderSlot('breakfast');

    expect(screen.queryByLabelText('Breakfast description')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add Breakfast' }));
    expect(screen.getByLabelText('Breakfast description')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add food manually/i })).toBeInTheDocument();
  });

  it('keeps saved slots expanded with their summary', () => {
    renderSlot('breakfast', savedBreakfast());
    expect(screen.queryByRole('button', { name: 'Add Breakfast' })).not.toBeInTheDocument();
    expect(screen.getByText(/400 cal · P 30g · C 40g · F 10g/)).toBeInTheDocument();
  });
});

describe('provider fallback disclosure', () => {
  it('shows user-facing fallback copy with vendor detail behind a disclosure', async () => {
    const user = userEvent.setup();
    const result: MacrosFromAI = {
      foods: [
        {
          food_name: 'Chicken bowl',
          quantity: 1,
          unit: 'bowl',
          calories: 550,
          protein_g: 40,
          carbs_g: 50,
          fat_g: 18,
          confidence: 'high',
        },
      ],
      meal_total: { calories: 550, protein_g: 40, carbs_g: 50, fat_g: 18 },
      provider: 'deepseek',
      model: 'deepseek-chat',
      fallback: true,
      fallback_reason: 'NVIDIA 429',
    };
    onCalculate.mockResolvedValue(result);

    renderSlot('lunch');
    await user.click(screen.getByRole('button', { name: 'Add Lunch' }));
    await user.type(screen.getByLabelText('Lunch description'), 'chicken bowl');
    await user.click(screen.getByRole('button', { name: /calculate with ai/i }));

    // Never silent: the notice is a status region with plain-language copy.
    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent(
      'Backup AI estimated these macros — double-check the numbers.',
    );

    // Vendor specifics live behind a tap but remain fully discoverable.
    const detail = screen.getByText(/deepseek-chat/i);
    expect(detail).not.toBeVisible();
    await user.click(screen.getByText(/details/i));
    expect(screen.getByText(/deepseek-chat/i)).toBeVisible();
    expect(screen.getByText(/NVIDIA 429/i)).toBeVisible();
  });

  it('shows no fallback notice when the primary provider answered', async () => {
    const user = userEvent.setup();
    onCalculate.mockResolvedValue({
      foods: [
        {
          food_name: 'Eggs',
          quantity: 2,
          unit: 'large',
          calories: 140,
          protein_g: 12,
          carbs_g: 1,
          fat_g: 10,
          confidence: 'high',
        },
      ],
      meal_total: { calories: 140, protein_g: 12, carbs_g: 1, fat_g: 10 },
      fallback: false,
    } satisfies MacrosFromAI);

    renderSlot('lunch');
    await user.click(screen.getByRole('button', { name: 'Add Lunch' }));
    await user.type(screen.getByLabelText('Lunch description'), 'two eggs');
    await user.click(screen.getByRole('button', { name: /calculate with ai/i }));

    expect(await screen.findByDisplayValue('Eggs')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
