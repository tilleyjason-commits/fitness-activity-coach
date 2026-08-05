import { useCallback, useEffect, useState } from 'react';
import { addDays, format, subDays } from 'date-fns';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useAuth } from '~/context/AuthContext';
import { useDailyLog } from '~/hooks/useDailyLog';
import {
  calculateMacros,
  deleteMeal,
  getMealFoods,
  getMealLogs,
  getProfile,
  getRecentMeals,
  saveMeal,
  type RecentMeal,
} from '~/lib/db';
import { MEAL_SLOTS, getMealSlotTimes, resolveMealTiming, resolveTargets } from '~/lib/constants';
import {
  addFavorite,
  getFavoritesForSlot,
  removeFavorite,
  type MealFavorite,
} from '~/lib/meal-favorites';
import type { MealFood, MealLog, MealSlot, Profile } from '~/lib/types';
import { PageHeader } from '~/components/PageHeader';
import { MealCard, type MealSaveInput, type QuickAddOption } from '~/components/MealCard';
import { DayMacroSummary } from '~/components/DayMacroSummary';

const MAX_RECENTS_PER_SLOT = 3;

/** Most recent distinct meals per slot (by description), newest first. */
function groupRecentsBySlot(recent: RecentMeal[]): Record<MealSlot, QuickAddOption[]> {
  const bySlot = {} as Record<MealSlot, QuickAddOption[]>;
  for (const slot of MEAL_SLOTS) bySlot[slot] = [];
  for (const { log, foods } of recent) {
    const label = log.raw_input?.trim();
    if (!label || foods.length === 0) continue;
    const forSlot = bySlot[log.meal_slot];
    if (forSlot.length >= MAX_RECENTS_PER_SLOT) continue;
    if (forSlot.some((r) => r.label === label)) continue;
    forSlot.push({
      label,
      mealTime: log.meal_time,
      foods: foods.map((f) => ({
        food_name: f.food_name,
        quantity: f.quantity,
        unit: f.unit,
        calories: f.calories,
        protein_g: f.protein_g,
        carbs_g: f.carbs_g,
        fat_g: f.fat_g,
        confidence: f.confidence,
      })),
    });
  }
  return bySlot;
}

/** AI-powered per-meal macro tracker: the canonical MEAL_SLOTS summing into daily_logs. */
export default function MacroTrackerPage() {
  const { user } = useAuth();
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const { log, loading, save, reload } = useDailyLog(date);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [mealLogs, setMealLogs] = useState<MealLog[]>([]);
  const [mealFoods, setMealFoods] = useState<MealFood[]>([]);
  const [mealsLoading, setMealsLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [recentsBySlot, setRecentsBySlot] = useState<Record<MealSlot, QuickAddOption[]>>(
    () => groupRecentsBySlot([]),
  );
  const [favoritesBySlot, setFavoritesBySlot] = useState<Record<MealSlot, MealFavorite[]>>(
    () => ({}) as Record<MealSlot, MealFavorite[]>,
  );

  useEffect(() => {
    if (!user) return;
    getProfile(user.id)
      .then(setProfile)
      .catch(() => setProfile(null));
  }, [user]);

  // Recents span every logged day (not just the selected one), so they only
  // need to load once per visit — a slot-scoped "quick add" list, not a
  // per-date view. Depends on user.id (not the user object) so a caller
  // whose auth value is a fresh object every render — the real AuthContext
  // memoizes it, but this must not assume every consumer does — can't turn
  // this into a fetch-loop: groupRecentsBySlot always returns a new object
  // reference, so an object-identity dependency would never stop re-firing.
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    getRecentMeals()
      .then((recent) => setRecentsBySlot(groupRecentsBySlot(recent)))
      .catch(() => setRecentsBySlot(groupRecentsBySlot([])));
  }, [userId]);

  // Favorites are local-only (see meal-favorites.ts) — read once per user,
  // then kept in sync locally on toggle without re-reading localStorage.
  useEffect(() => {
    if (!userId) return;
    const bySlot = {} as Record<MealSlot, MealFavorite[]>;
    for (const slot of MEAL_SLOTS) bySlot[slot] = getFavoritesForSlot(userId, slot);
    setFavoritesBySlot(bySlot);
  }, [userId]);

  const targets = resolveTargets(profile);
  const slotTimes = getMealSlotTimes(resolveMealTiming(profile));

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

  /** Add/remove the currently saved meal for this slot from local favorites. */
  function handleToggleFavorite(slot: MealSlot, mealLog: MealLog, foods: MealFood[]) {
    if (!user || !mealLog.raw_input) return;
    const userId = user.id;
    const existing = favoritesBySlot[slot] ?? [];
    const match = existing.find((f) => f.label === mealLog.raw_input);
    if (match) {
      removeFavorite(userId, match.id);
      setFavoritesBySlot((prev) => ({
        ...prev,
        [slot]: (prev[slot] ?? []).filter((f) => f.id !== match.id),
      }));
      return;
    }
    const created = addFavorite(userId, {
      slot,
      label: mealLog.raw_input,
      mealTime: mealLog.meal_time,
      foods: foods.map((f) => ({
        food_name: f.food_name,
        quantity: f.quantity,
        unit: f.unit,
        calories: f.calories,
        protein_g: f.protein_g,
        carbs_g: f.carbs_g,
        fat_g: f.fat_g,
        confidence: f.confidence,
      })),
    });
    setFavoritesBySlot((prev) => ({ ...prev, [slot]: [...(prev[slot] ?? []), created] }));
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
            const slotFoods = mealLog ? (foodsByMealId.get(mealLog.id) ?? []) : [];
            const slotFavorites = favoritesBySlot[slot] ?? [];
            return (
              <MealCard
                key={`${date}-${slot}`}
                slot={slot}
                mealLog={mealLog}
                foods={slotFoods}
                slotTimes={slotTimes}
                onCalculate={calculateMacros}
                onSave={handleSave}
                onClear={handleClear}
                favorites={slotFavorites}
                recents={recentsBySlot[slot] ?? []}
                isFavorited={
                  mealLog?.raw_input != null &&
                  slotFavorites.some((f) => f.label === mealLog.raw_input)
                }
                onToggleFavorite={
                  mealLog ? () => handleToggleFavorite(slot, mealLog, slotFoods) : undefined
                }
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
