import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ChevronRight, Loader2, Minus, Plus, Sparkles } from 'lucide-react';
import { useDailyLog } from '~/hooks/useDailyLog';
import { toHHMM } from '~/lib/evaluate';
import { MEAL_TIMING, TARGETS } from '~/lib/constants';
import type { DailyLog } from '~/lib/types';
import { PageHeader } from '~/components/PageHeader';
import { ToggleRow } from '~/components/ToggleRow';

function toStr(value: number | null): string {
  return value === null ? '' : String(value);
}

function toNum(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}

interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

function Stepper({ label, value, min, max, onChange }: StepperProps) {
  return (
    <div className="card flex items-center justify-between gap-3">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
          className="rounded-xl bg-slate-200 p-2 text-slate-600 transition-colors disabled:opacity-40 dark:bg-slate-700 dark:text-slate-200"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-6 text-center text-base font-semibold tabular-nums">{value}</span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
          className="rounded-xl bg-slate-200 p-2 text-slate-600 transition-colors disabled:opacity-40 dark:bg-slate-700 dark:text-slate-200"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function LogNutrition() {
  const navigate = useNavigate();
  const today = format(new Date(), 'yyyy-MM-dd');
  const { log, loading, saving, error, save } = useDailyLog(today);

  const [protein, setProtein] = useState('');
  const [calories, setCalories] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [preGymTime, setPreGymTime] = useState('');
  const [postGymTime, setPostGymTime] = useState('');
  const [snack3pm, setSnack3pm] = useState(false);
  const [casein, setCasein] = useState(false);
  const [dinnerLogged, setDinnerLogged] = useState(false);
  const [dinnerPlates, setDinnerPlates] = useState(1);
  const [proteinFirst, setProteinFirst] = useState(false);
  const [candy, setCandy] = useState(0);

  useEffect(() => {
    if (!log) return;
    setProtein(toStr(log.daily_protein_g));
    setCalories(toStr(log.daily_calories));
    setCarbs(toStr(log.daily_carbs_g));
    setFat(toStr(log.daily_fat_g));
    setPreGymTime(toHHMM(log.pre_gym_snack_time) ?? '');
    setPostGymTime(toHHMM(log.post_gym_meal_time) ?? '');
    setSnack3pm(log.snack_3pm_logged);
    setCasein(log.casein_taken);
    setDinnerLogged(log.dinner_logged);
    setDinnerPlates(log.dinner_plates);
    setProteinFirst(log.dinner_protein_first);
    setCandy(log.candy_cravings_today);
  }, [log]);

  const proteinValue = toNum(protein);
  const proteinStatus =
    proteinValue === null
      ? 'text-slate-500 dark:text-slate-400'
      : proteinValue >= TARGETS.proteinMinG && proteinValue <= TARGETS.proteinMaxG + 30
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-amber-600 dark:text-amber-400';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const patch: Partial<DailyLog> = {
      daily_protein_g: proteinValue,
      daily_calories: toNum(calories),
      daily_carbs_g: toNum(carbs),
      daily_fat_g: toNum(fat),
      pre_gym_snack_time: preGymTime || null,
      post_gym_meal_time: postGymTime || null,
      snack_3pm_logged: snack3pm,
      casein_taken: casein,
      dinner_logged: dinnerLogged,
      dinner_plates: dinnerPlates,
      dinner_protein_first: proteinFirst,
      candy_cravings_today: candy,
    };
    const saved = await save(patch);
    if (saved) navigate('/');
  }

  return (
    <form onSubmit={handleSubmit}>
      <PageHeader title="Adjust Daily Totals" subtitle={format(new Date(), 'EEEE, MMMM d')} backTo="/log" />

      <Link
        to="/macros"
        className="card mb-4 flex items-center justify-between gap-3 transition-colors hover:border-emerald-400 dark:hover:border-emerald-500"
      >
        <span className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden />
          <span>
            <span className="block text-sm font-semibold">
              Log your meals with AI macro tracking
            </span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              Describe a meal and totals fill in automatically
            </span>
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
      </Link>

      <section className="card mb-4" aria-label="Protein">
        <div className="mb-2 flex items-baseline justify-between">
          <label htmlFor="protein-slider" className="label mb-0">
            Protein
          </label>
          <span className={`text-sm font-semibold tabular-nums ${proteinStatus}`}>
            {proteinValue ?? 'â€”'} g
            <span className="ml-1 font-normal text-slate-400 dark:text-slate-500">
              / {TARGETS.proteinMinG}â€“{TARGETS.proteinMaxG} g
            </span>
          </span>
        </div>
        <input
          id="protein-slider"
          type="range"
          min={0}
          max={300}
          step={5}
          value={proteinValue ?? 0}
          onChange={(e) => setProtein(e.target.value)}
          className="w-full accent-emerald-500"
        />
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={400}
          value={protein}
          onChange={(e) => setProtein(e.target.value)}
          placeholder="Grams of protein"
          aria-label="Protein in grams"
          className="field mt-3"
        />
      </section>

      <section className="mb-4" aria-label="Macros">
        <h2 className="section-title">Macros</h2>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="calories" className="label text-xs">
              Calories
            </label>
            <input
              id="calories"
              type="number"
              inputMode="numeric"
              min={0}
              value={calories}
              onChange={(e) => setCalories(e.target.value)}
              placeholder={String(TARGETS.calories)}
              className="field px-2"
            />
          </div>
          <div>
            <label htmlFor="carbs" className="label text-xs">
              Carbs (g)
            </label>
            <input
              id="carbs"
              type="number"
              inputMode="numeric"
              min={0}
              value={carbs}
              onChange={(e) => setCarbs(e.target.value)}
              placeholder={String(TARGETS.carbsG)}
              className="field px-2"
            />
          </div>
          <div>
            <label htmlFor="fat" className="label text-xs">
              Fat (g)
            </label>
            <input
              id="fat"
              type="number"
              inputMode="numeric"
              min={0}
              value={fat}
              onChange={(e) => setFat(e.target.value)}
              placeholder={String(TARGETS.fatG)}
              className="field px-2"
            />
          </div>
        </div>
      </section>

      <section className="mb-4" aria-label="Meal timing">
        <h2 className="section-title">Meal timing</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="pre-gym" className="label">
              Pre-gym snack
            </label>
            <input
              id="pre-gym"
              type="time"
              value={preGymTime}
              onChange={(e) => setPreGymTime(e.target.value)}
              className="field"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              target ~{MEAL_TIMING.preGymSnack}
            </p>
          </div>
          <div>
            <label htmlFor="post-gym" className="label">
              Post-gym meal
            </label>
            <input
              id="post-gym"
              type="time"
              value={postGymTime}
              onChange={(e) => setPostGymTime(e.target.value)}
              className="field"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              target ~{MEAL_TIMING.postGymMeal}
            </p>
          </div>
        </div>
      </section>

      <section className="mb-4 space-y-3" aria-label="Habits">
        <h2 className="section-title">Habits</h2>
        <ToggleRow
          label="3pm snack taken"
          description={`Planned for ${MEAL_TIMING.snack3pm}`}
          checked={snack3pm}
          onChange={setSnack3pm}
        />
        <ToggleRow
          label="Casein taken"
          description={`Before bed, ~${MEAL_TIMING.casein}`}
          checked={casein}
          onChange={setCasein}
        />
        <ToggleRow label="Dinner logged" checked={dinnerLogged} onChange={setDinnerLogged} />
        {dinnerLogged && (
          <>
            <Stepper
              label="Dinner plates"
              value={dinnerPlates}
              min={0}
              max={5}
              onChange={setDinnerPlates}
            />
            <ToggleRow
              label="Protein eaten first"
              description="At dinner, before carbs"
              checked={proteinFirst}
              onChange={setProteinFirst}
            />
          </>
        )}
        <Stepper label="Candy cravings today" value={candy} min={0} max={20} onChange={setCandy} />
      </section>

      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      <button type="submit" disabled={saving || loading} className="btn-primary">
        {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        Save nutrition
      </button>
    </form>
  );
}
