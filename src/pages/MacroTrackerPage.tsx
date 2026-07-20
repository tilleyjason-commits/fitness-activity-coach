import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { useDailyLog } from '~/hooks/useDailyLog';
import { calculateMacros, deleteMeal, getMealFoods, getMealLogs, saveMeal } from '~/lib/db';
import { MEAL_SLOTS } from '~/lib/constants';
import type { MealFood, MealLog, MealSlot } from '~/lib/types';
import { PageHeader } from '~/components/PageHeader';
import { MealCard, type MealSaveInput } from '~/components/MealCard';
import { DayMacroSummary } from '~/components/DayMacroSummary';

/** AI-powered per-meal macro tracker: five slots summing into daily_logs. */
export default function MacroTrackerPage() {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const { log, loading, save, reload } = useDailyLog(date);

  const [mealLogs, setMealLogs] = useState<MealLog[]>([]);
  const [mealFoods, setMealFoods] = useState<MealFood[]>([]);
  const [mealsLoading, setMealsLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const loadMeals = useCallback(async (dailyLogId: string | null) => {
    if (!dailyLogId) {
      setMealLogs([]);
      setMealFoods([]);
      return;
    }
    setMealsLoading(true);
    setPageError(null);
    try {
      const logs = await getMealLogs(dailyLogId);
      const foods = await getMealFoods(logs.map((m) => m.id));
      setMealLogs(logs);
      setMealFoods(foods);
    } catch (e) {
      setPageError(e instanceof Error ? e.message : 'Failed to load meals');
    } finally {
      setMealsLoading(false);
    }
  }, []);

  const dailyLogId = log?.id ?? null;
  useEffect(() => {
    void loadMeals(dailyLogId);
  }, [dailyLogId, loadMeals]);

  /** The daily_logs row is created lazily on the first meal save. */
  async function ensureDailyLog(): Promise<string> {
    if (log) return log.id;
    const created = await save({});
    if (!created) throw new Error('Could not create the daily log for this date.');
    return created.id;
  }

  async function handleSave(slot: MealSlot, input: MealSaveInput): Promise<void> {
    const id = await ensureDailyLog();
    // One transactional round trip: meal log + foods + daily totals (RPC).
    await saveMeal(id, slot, input);
    await Promise.all([loadMeals(id), reload()]);
  }

  async function handleClear(slot: MealSlot): Promise<void> {
    if (!log) return;
    await deleteMeal(log.id, slot);
    await Promise.all([loadMeals(log.id), reload()]);
  }

  const dayTotals = mealLogs.reduce(
    (acc, meal) => ({
      calories: acc.calories + (meal.total_calories ?? 0),
      protein: acc.protein + Number(meal.total_protein_g ?? 0),
      carbs: acc.carbs + Number(meal.total_carbs_g ?? 0),
      fat: acc.fat + Number(meal.total_fat_g ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  const mealBySlot = new Map(mealLogs.map((m) => [m.meal_slot, m]));
  const foodsByMealId = new Map<string, MealFood[]>();
  for (const food of mealFoods) {
    const list = foodsByMealId.get(food.meal_log_id) ?? [];
    list.push(food);
    foodsByMealId.set(food.meal_log_id, list);
  }

  return (
    <div>
      <PageHeader title="Today's Meals" subtitle="Describe a meal — AI fills in the macros" />

      <div className="mb-4">
        <label htmlFor="macro-date" className="label">
          Date
        </label>
        <input
          id="macro-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="field"
        />
      </div>

      {pageError && <p className="mb-3 text-sm text-red-500">{pageError}</p>}

      {loading || mealsLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-500" aria-label="Loading meals" />
        </div>
      ) : (
        <>
          {MEAL_SLOTS.map((slot) => {
            const mealLog = mealBySlot.get(slot) ?? null;
            return (
              <MealCard
                key={`${date}-${slot}`}
                slot={slot}
                mealLog={mealLog}
                foods={mealLog ? (foodsByMealId.get(mealLog.id) ?? []) : []}
                onCalculate={calculateMacros}
                onSave={handleSave}
                onClear={handleClear}
              />
            );
          })}

          <DayMacroSummary
            calories={dayTotals.calories}
            protein={dayTotals.protein}
            carbs={dayTotals.carbs}
            fat={dayTotals.fat}
          />
        </>
      )}
    </div>
  );
}
