import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import MacroTrackerPage from '~/pages/MacroTrackerPage';
import type { DailyLog, MealFood, MealLog } from '~/lib/types';

/**
 * MacroTrackerPage renders one card per canonical slot and sums whatever rows
 * the repository returns. Repository functions and the daily-log hook are
 * mocked at the boundary — no Supabase client, no network.
 */

const getMealLogsMock = vi.fn();
const getMealFoodsMock = vi.fn();

vi.mock('~/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 't@t.com' }, loading: false }),
}));

vi.mock('~/lib/db', () => ({
  getMealLogs: (...args: unknown[]) => getMealLogsMock(...args),
  getMealFoods: (...args: unknown[]) => getMealFoodsMock(...args),
  getProfile: () => Promise.resolve(null),
  saveMeal: vi.fn(),
  deleteMeal: vi.fn(),
  calculateMacros: vi.fn(),
}));

const dailyLog = { id: 'dl-1' } as DailyLog;

vi.mock('~/hooks/useDailyLog', () => ({
  useDailyLog: () => ({
    log: dailyLog,
    loading: false,
    saving: false,
    error: null,
    save: vi.fn(),
    reload: vi.fn(),
  }),
}));

const APPROVED_LABEL_ORDER = [
  'Breakfast',
  'Pre-Workout Snack',
  'Lunch',
  'Post-Gym Meal',
  'Snack',
  'Dinner',
  'Bedtime Snack',
];

function mealLog(id: string, slot: string, cal: number, p: number, c: number, f: number): MealLog {
  return {
    id,
    daily_log_id: 'dl-1',
    meal_slot: slot,
    meal_time: null,
    raw_input: null,
    total_calories: cal,
    total_protein_g: p,
    total_carbs_g: c,
    total_fat_g: f,
    created_at: '2026-01-01T00:00:00Z',
  } as MealLog;
}

function mealFood(id: string, mealLogId: string, name: string, cal: number): MealFood {
  return {
    id,
    meal_log_id: mealLogId,
    food_name: name,
    quantity: 1,
    unit: null,
    calories: cal,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    confidence: 'high',
    created_at: '2026-01-01T00:00:00Z',
  };
}

async function mealCardRegions() {
  // Wait for the async meal load to settle, then collect the slot cards
  // (the Daily total bar is also a region — exclude it).
  await screen.findByRole('region', { name: 'Daily total' });
  return screen
    .getAllByRole('region')
    .filter((el) => el.getAttribute('aria-label') !== 'Daily total');
}

describe('MacroTrackerPage slot rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMealLogsMock.mockResolvedValue([]);
    getMealFoodsMock.mockResolvedValue([]);
  });

  it('renders seven meal cards in the exact approved DOM order', async () => {
    render(<MacroTrackerPage />);

    const cards = await mealCardRegions();
    expect(cards.map((el) => el.getAttribute('aria-label'))).toEqual(APPROVED_LABEL_ORDER);
  });

  it('maps saved rows for both new slots onto the correct cards', async () => {
    getMealLogsMock.mockResolvedValue([
      mealLog('m-pre', 'pre_workout_snack', 105, 1, 27, 0),
      mealLog('m-bed', 'bedtime_snack', 120, 24, 3, 1),
    ]);
    getMealFoodsMock.mockResolvedValue([
      mealFood('f-1', 'm-pre', 'Banana', 105),
      mealFood('f-2', 'm-bed', 'Casein shake', 120),
    ]);

    render(<MacroTrackerPage />);
    await mealCardRegions();

    const preCard = screen.getByRole('region', { name: 'Pre-Workout Snack' });
    expect(within(preCard).getByText(/Banana/)).toBeInTheDocument();
    expect(within(preCard).getByText(/105 cal · P 1g · C 27g · F 0g/)).toBeInTheDocument();

    const bedCard = screen.getByRole('region', { name: 'Bedtime Snack' });
    expect(within(bedCard).getByText(/Casein shake/)).toBeInTheDocument();
    expect(within(bedCard).getByText(/120 cal · P 24g · C 3g · F 1g/)).toBeInTheDocument();

    // The rows land only on their own cards.
    const lunchCard = screen.getByRole('region', { name: 'Lunch' });
    expect(within(lunchCard).queryByText(/Banana|Casein shake/)).toBeNull();
  });

  it('includes both new rows in the daily totals', async () => {
    getMealLogsMock.mockResolvedValue([
      mealLog('m-pre', 'pre_workout_snack', 105, 1, 27, 0),
      mealLog('m-bed', 'bedtime_snack', 120, 24, 3, 1),
    ]);

    render(<MacroTrackerPage />);
    const summary = await screen.findByRole('region', { name: 'Daily total' });

    expect(within(summary).getByText('225')).toBeInTheDocument();
    expect(within(summary).getByText('25g')).toBeInTheDocument();
    expect(within(summary).getByText('30g')).toBeInTheDocument();
    expect(within(summary).getByText('1g')).toBeInTheDocument();
  });

  it('renders all seven independent empty cards when old data lacks the new slots', async () => {
    getMealLogsMock.mockResolvedValue([mealLog('m-old', 'breakfast', 400, 30, 40, 10)]);
    getMealFoodsMock.mockResolvedValue([mealFood('f-old', 'm-old', 'Oatmeal', 400)]);

    render(<MacroTrackerPage />);

    const cards = await mealCardRegions();
    expect(cards.map((el) => el.getAttribute('aria-label'))).toEqual(APPROVED_LABEL_ORDER);

    // New slots stay empty and interactive (idle state offers manual entry).
    for (const name of ['Pre-Workout Snack', 'Bedtime Snack']) {
      const card = screen.getByRole('region', { name });
      expect(
        within(card).getByRole('button', { name: /add food manually/i }),
      ).toBeInTheDocument();
    }
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
