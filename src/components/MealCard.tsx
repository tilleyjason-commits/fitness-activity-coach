import { useEffect, useState } from 'react';
import { Loader2, Pencil, Sparkles, Trash2, X } from 'lucide-react';
import { MEAL_SLOT_ICONS, MEAL_SLOT_LABELS, MEAL_SLOT_TIMES } from '~/lib/constants';
import { toHHMM } from '~/lib/evaluate';
import type { MacrosFromAI, MealFood, MealLog, MealSlot } from '~/lib/types';

type CardState = 'idle' | 'calculating' | 'results' | 'saved' | 'error';

type Confidence = 'high' | 'medium' | 'low' | null;

/** Editable food row — numeric fields kept as strings while typing. */
interface FoodDraft {
  food_name: string;
  quantity: string;
  unit: string;
  calories: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
  confidence: Confidence;
}

export interface MealSaveInput {
  rawInput: string;
  mealTime: string | null;
  foods: {
    food_name: string;
    quantity: number | null;
    unit: string | null;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    confidence: Confidence;
  }[];
}

interface MealCardProps {
  slot: MealSlot;
  /** Saved row for this slot, if any. */
  mealLog: MealLog | null;
  /** Saved food rows belonging to mealLog. */
  foods: MealFood[];
  onCalculate: (description: string, slot: MealSlot) => Promise<MacrosFromAI>;
  onSave: (slot: MealSlot, input: MealSaveInput) => Promise<void>;
  onClear: (slot: MealSlot) => Promise<void>;
}

function toDraft(food: MealFood): FoodDraft {
  return {
    food_name: food.food_name,
    quantity: food.quantity === null ? '' : String(food.quantity),
    unit: food.unit ?? '',
    calories: String(food.calories),
    protein_g: String(food.protein_g),
    carbs_g: String(food.carbs_g),
    fat_g: String(food.fat_g),
    confidence: food.confidence,
  };
}

function aiToDraft(food: MacrosFromAI['foods'][number]): FoodDraft {
  return {
    food_name: food.food_name,
    quantity: String(food.quantity),
    unit: food.unit,
    calories: String(food.calories),
    protein_g: String(food.protein_g),
    carbs_g: String(food.carbs_g),
    fat_g: String(food.fat_g),
    confidence: food.confidence,
  };
}

function num(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function draftTotals(drafts: FoodDraft[]) {
  return drafts.reduce(
    (acc, d) => ({
      calories: acc.calories + num(d.calories),
      protein: acc.protein + num(d.protein_g),
      carbs: acc.carbs + num(d.carbs_g),
      fat: acc.fat + num(d.fat_g),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

const CONFIDENCE_DOT: Record<'high' | 'medium' | 'low', string> = {
  high: 'bg-emerald-500',
  medium: 'bg-amber-500',
  low: 'bg-red-500',
};

/** One meal slot: describe → AI calculate → edit → save into meal_logs. */
export function MealCard({ slot, mealLog, foods, onCalculate, onSave, onClear }: MealCardProps) {
  const [state, setState] = useState<CardState>(mealLog ? 'saved' : 'idle');
  const [description, setDescription] = useState(mealLog?.raw_input ?? '');
  const [mealTime, setMealTime] = useState(
    toHHMM(mealLog?.meal_time ?? null) ?? MEAL_SLOT_TIMES[slot].start,
  );
  const [drafts, setDrafts] = useState<FoodDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync only when the underlying row appears/disappears, so in-progress
  // edits on other cards survive parent reloads.
  useEffect(() => {
    if (mealLog) {
      setDescription(mealLog.raw_input ?? '');
      setMealTime(toHHMM(mealLog.meal_time) ?? MEAL_SLOT_TIMES[slot].start);
      setState('saved');
    } else {
      setDescription('');
      setMealTime(MEAL_SLOT_TIMES[slot].start);
      setDrafts([]);
      setState('idle');
    }
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mealLog?.id]);

  async function handleCalculate() {
    const trimmed = description.trim();
    if (!trimmed) return;
    setState('calculating');
    setError(null);
    try {
      const result = await onCalculate(trimmed, slot);
      setDrafts(result.foods.map(aiToDraft));
      setState('results');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Macro calculation failed');
      setState('error');
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave(slot, {
        rawInput: description.trim(),
        mealTime: mealTime || null,
        foods: drafts.map((d) => ({
          food_name: d.food_name.trim() || 'Unknown food',
          quantity: d.quantity.trim() === '' ? null : num(d.quantity),
          unit: d.unit.trim() || null,
          calories: Math.round(num(d.calories)),
          protein_g: num(d.protein_g),
          carbs_g: num(d.carbs_g),
          fat_g: num(d.fat_g),
          confidence: d.confidence,
        })),
      });
      setState('saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save meal');
      setState('error');
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setError(null);
    if (!mealLog) {
      setDescription('');
      setDrafts([]);
      setState('idle');
      return;
    }
    setSaving(true);
    try {
      await onClear(slot);
      // Parent reload drops mealLog → the sync effect resets this card to idle.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to clear meal');
      setState('error');
    } finally {
      setSaving(false);
    }
  }

  function startEdit() {
    setDrafts(foods.map(toDraft));
    setState('results');
  }

  function updateDraft(index: number, patch: Partial<FoodDraft>) {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  function removeDraft(index: number) {
    setDrafts((prev) => prev.filter((_, i) => i !== index));
  }

  const totals = draftTotals(drafts);
  const busy = state === 'calculating' || saving;

  return (
    <section className="card mb-4" aria-label={MEAL_SLOT_LABELS[slot]}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-lg">
            {MEAL_SLOT_ICONS[slot]}
          </span>
          <div>
            <h2 className="text-sm font-semibold">{MEAL_SLOT_LABELS[slot]}</h2>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              {MEAL_SLOT_TIMES[slot].hint}
            </p>
          </div>
        </div>
        <input
          type="time"
          value={mealTime}
          onChange={(e) => setMealTime(e.target.value)}
          disabled={busy || state === 'saved'}
          aria-label={`${MEAL_SLOT_LABELS[slot]} time`}
          className="field w-auto px-2 py-1.5 text-sm"
        />
      </header>

      {state === 'saved' && mealLog ? (
        <>
          {mealLog.raw_input && (
            <p className="mb-2 text-xs italic text-slate-500 dark:text-slate-400">
              “{mealLog.raw_input}”
            </p>
          )}
          <ul className="mb-2 divide-y divide-slate-100 dark:divide-slate-700/60">
            {foods.map((food) => (
              <li key={food.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                <span className="flex items-center gap-2 truncate">
                  {food.confidence && (
                    <span
                      aria-label={`${food.confidence} confidence`}
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${CONFIDENCE_DOT[food.confidence]}`}
                    />
                  )}
                  <span className="truncate">
                    {food.quantity !== null && `${food.quantity} `}
                    {food.unit && `${food.unit} `}
                    {food.food_name}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                  {food.calories} cal
                </span>
              </li>
            ))}
          </ul>
          <p className="mb-3 text-right text-sm font-semibold tabular-nums">
            {mealLog.total_calories} cal · P {mealLog.total_protein_g}g · C {mealLog.total_carbs_g}g
            · F {mealLog.total_fat_g}g
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={startEdit}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-200 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-300 disabled:opacity-50 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            <button
              type="button"
              onClick={() => void handleClear()}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-50 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Clear
            </button>
          </div>
        </>
      ) : state === 'error' ? (
        <>
          <p className="mb-3 text-sm text-red-500">{error ?? 'Something went wrong.'}</p>
          <button
            type="button"
            onClick={() => setState(drafts.length > 0 ? 'results' : 'idle')}
            className="w-full rounded-xl bg-slate-200 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          >
            Try again
          </button>
        </>
      ) : (
        <>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={busy}
            rows={2}
            placeholder="Describe what you ate..."
            aria-label={`${MEAL_SLOT_LABELS[slot]} description`}
            className="field mb-3 resize-none"
          />

          {(state === 'results' || drafts.length > 0) && (
            <div className="mb-3 space-y-2">
              {drafts.map((draft, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-slate-200 p-2.5 dark:border-slate-700/60"
                >
                  <div className="mb-2 flex items-center gap-2">
                    {draft.confidence && (
                      <span
                        aria-label={`${draft.confidence} confidence`}
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${CONFIDENCE_DOT[draft.confidence]}`}
                      />
                    )}
                    <input
                      type="text"
                      value={draft.food_name}
                      onChange={(e) => updateDraft(i, { food_name: e.target.value })}
                      aria-label="Food name"
                      className="field flex-1 px-2 py-1.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => removeDraft(i)}
                      aria-label={`Remove ${draft.food_name}`}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-red-500 dark:hover:bg-slate-700"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-6 gap-1.5">
                    <label className="col-span-1 block">
                      <span className="block text-[10px] text-slate-400">Qty</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={draft.quantity}
                        onChange={(e) => updateDraft(i, { quantity: e.target.value })}
                        className="field px-1.5 py-1 text-xs"
                      />
                    </label>
                    <label className="col-span-1 block">
                      <span className="block text-[10px] text-slate-400">Unit</span>
                      <input
                        type="text"
                        value={draft.unit}
                        onChange={(e) => updateDraft(i, { unit: e.target.value })}
                        className="field px-1.5 py-1 text-xs"
                      />
                    </label>
                    <label className="col-span-1 block">
                      <span className="block text-[10px] text-slate-400">Cal</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={draft.calories}
                        onChange={(e) => updateDraft(i, { calories: e.target.value })}
                        className="field px-1.5 py-1 text-xs"
                      />
                    </label>
                    <label className="col-span-1 block">
                      <span className="block text-[10px] text-slate-400">P (g)</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={draft.protein_g}
                        onChange={(e) => updateDraft(i, { protein_g: e.target.value })}
                        className="field px-1.5 py-1 text-xs"
                      />
                    </label>
                    <label className="col-span-1 block">
                      <span className="block text-[10px] text-slate-400">C (g)</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={draft.carbs_g}
                        onChange={(e) => updateDraft(i, { carbs_g: e.target.value })}
                        className="field px-1.5 py-1 text-xs"
                      />
                    </label>
                    <label className="col-span-1 block">
                      <span className="block text-[10px] text-slate-400">F (g)</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={draft.fat_g}
                        onChange={(e) => updateDraft(i, { fat_g: e.target.value })}
                        className="field px-1.5 py-1 text-xs"
                      />
                    </label>
                  </div>
                </div>
              ))}
              <p className="text-right text-sm font-semibold tabular-nums">
                Total: {Math.round(totals.calories)} cal · P {Math.round(totals.protein * 10) / 10}g
                · C {Math.round(totals.carbs * 10) / 10}g · F {Math.round(totals.fat * 10) / 10}g
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleCalculate()}
              disabled={busy || description.trim() === ''}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {state === 'calculating' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden />
              )}
              {state === 'calculating' ? 'Calculating…' : 'Calculate with AI'}
            </button>
            {state === 'results' && (
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={busy || drafts.length === 0}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-800 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Save
              </button>
            )}
            {(state === 'results' || mealLog) && (
              <button
                type="button"
                onClick={() => void handleClear()}
                disabled={busy}
                aria-label={`Clear ${MEAL_SLOT_LABELS[slot]}`}
                className="rounded-xl bg-slate-200 px-3 py-2 text-slate-600 transition-colors hover:bg-slate-300 disabled:opacity-50 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
