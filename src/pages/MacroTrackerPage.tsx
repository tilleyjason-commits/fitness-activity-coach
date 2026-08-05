import { useCallback, useEffect, useState } from 'react';
import { addDays, format, parseISO, subDays } from 'date-fns';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useAuth } from '~/context/AuthContext';
import { useDailyLog } from '~/hooks/useDailyLog';
import {
  calculateMacros,
  deleteMeal,
  getDailyLog,
  getMealFoods,
  getMealLogs,
  getProfile,
  saveMeal,
  upsertDailyLog,
} from '~/lib/db';
import {
  flushMealSaveQueue,
  hasPendingMealSaves,
  saveMealWithOfflineQueue,
} from '~/lib/meal-offline-queue';
import { MEAL_SLOTS, resolveTargets } from '~/lib/constants';
import type { MealFood, MealLog, MealSlot, Profile } from '~/lib/types';
import { PageHeader } from '~/components/PageHeader';
import { MealCard, type MealSaveInput } from '~/components/MealCard';
import { DayMacroSummary } from '~/components/DayMacroSummary';

/** AI-powered per-meal macro tracker: the canonical MEAL_SLOTS summing into daily_logs. */
export default function MacroTrackerPage() {
  const { user } = useAuth();
  const userId = user?.id;
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const { log, loading, reload } = useDailyLog(date);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [mealLogs, setMealLogs] = useState<MealLog[]>([]);
  const [mealFoods, setMealFoods] = useState<MealFood[]>([]);
  const [mealsLoading, setMealsLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    getProfile(userId)
      .then(setProfile)
      .catch(() => setProfile(null));
  }, [userId]);

  const targets = resolveTargets(profile);

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

  /**
   * The daily_logs row is created lazily on the first meal save. Resolves
   * any date, not just the one currently viewed — the offline queue can
   * flush a save for an earlier day than whatever is on screen right now.
   */
  const ensureDailyLogId = useCallback(
    async (forDate: string): Promise<string> => {
      if (!userId) throw new Error('Not signed in.');
      if (forDate === date && log) return log.id;
      const existing = await getDailyLog(userId, forDate);
      if (existing) return existing.id;
      const created = await upsertDailyLog({
        user_id: userId,
        log_date: forDate,
        day_of_week: format(parseISO(forDate), 'EEEE'),
      });
      if (forDate === date) void reload();
      return created.id;
    },
    [userId, date, log, reload],
  );

  // Drain any meal saves queued from an earlier offline session as soon as a
  // user is available — see meal-offline-queue.ts. Deliberately keyed only
  // on userId (not date/log/reload, which change on every day-page and
  // would make this re-fire constantly); the queue itself is empty in the
  // common case, so the extra check is cheap.
  useEffect(() => {
    if (!userId) return;
    if (!hasPendingMealSaves(userId)) return;
    let cancelled = false;
    void flushMealSaveQueue(userId, ensureDailyLogId, saveMeal).then((result) => {
      if (!cancelled && result.flushed > 0) {
        void Promise.all([loadMeals(dailyLogId), reload()]);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function handleSave(slot: MealSlot, input: MealSaveInput): Promise<void> {
    if (!userId) return;
    // One transactional round trip: meal log + foods + daily totals (RPC).
    await saveMealWithOfflineQueue(userId, date, slot, input, ensureDailyLogId, saveMeal);
    await Promise.all([loadMeals(await ensureDailyLogId(date)), reload()]);
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

  const today = format(new Date(), 'yyyy-MM-dd');
  const isToday = date === today;
  const selectedDate = new Date(`${date}T00:00:00`);

  return (
    <div>
      <PageHeader
        title={`Meals · ${format(selectedDate, 'EEE, MMM d')}`}
        subtitle="Describe a meal — AI fills in the macros"
        backTo="/log"
      />

      {/* One-handed day pager; the calendar input stays for bigger jumps. */}
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setDate(format(subDays(selectedDate, 1), 'yyyy-MM-dd'))}
          aria-label="Previous day"
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:border-slate-700/60 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="relative min-w-0 flex-1">
          <label htmlFor="macro-date" className="sr-only">
            Date
          </label>
          <input
            id="macro-date"
            type="date"
            value={date}
            max={today}
            onChange={(e) => {
              const next = e.target.value;
              if (next && next <= today) setDate(next);
            }}
            className="field"
          />
          {isToday && (
            <span className="pointer-events-none absolute right-10 top-1/2 -translate-y-1/2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              Today
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDate(format(addDays(selectedDate, 1), 'yyyy-MM-dd'))}
          disabled={isToday}
          aria-label="Next day"
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700/60 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
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
            targets={targets}
          />
        </>
      )}
    </div>
  );
}
