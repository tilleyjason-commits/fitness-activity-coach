import type { MacroTargets } from '~/lib/constants';
import { DEFAULT_TARGETS } from '~/lib/constants';

interface DayMacroSummaryProps {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  targets?: MacroTargets;
}

/**
 * Daily totals bar for the macro tracker. Color-coded against the calorie
 * range: green in range, amber under (day in progress), red over.
 */
export function DayMacroSummary({
  calories,
  protein,
  carbs,
  fat,
  targets = DEFAULT_TARGETS,
}: DayMacroSummaryProps) {
  const pct = Math.min(100, Math.round((calories / targets.calories) * 100));
  const proteinPct = Math.min(100, Math.round((protein / targets.proteinG) * 100));
  const status =
    calories > targets.caloriesMax
      ? { bar: 'bg-red-500', text: 'text-red-600 dark:text-red-400', label: 'over target' }
      : calories >= targets.caloriesMin
        ? { bar: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', label: 'on track' }
        : calories >= targets.caloriesMin * 0.8
          ? { bar: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', label: 'close' }
          : { bar: 'bg-slate-400', text: 'text-slate-500 dark:text-slate-400', label: 'in progress' };

  const cells = [
    { label: 'Calories', value: calories.toLocaleString(), target: targets.calories.toLocaleString() },
    { label: 'Protein', value: `${Math.round(protein)}g`, target: `${targets.proteinG}g` },
    { label: 'Carbs', value: `${Math.round(carbs)}g`, target: `${targets.carbsG}g` },
    { label: 'Fat', value: `${Math.round(fat)}g`, target: `${targets.fatG}g` },
  ];

  return (
    <section className="card sticky bottom-24 z-10 shadow-lg" aria-label="Daily total">
      <h2 className="section-title mb-3">Daily total</h2>
      <div className="mb-3 grid grid-cols-4 gap-2 text-center">
        {cells.map(({ label, value, target }) => (
          <div key={label}>
            <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
            <p className="text-base font-bold tabular-nums">{value}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">/ {target}</p>
          </div>
        ))}
      </div>
      {/* Protein is the coaching priority — it gets its own bar, not just a cell. */}
      <div className="mb-2">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Protein</span>
          <span className="text-xs font-semibold tabular-nums">
            {Math.round(protein)}g / {targets.proteinG}g
          </span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
          role="progressbar"
          aria-valuenow={proteinPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Protein vs target"
        >
          <div
            className={`h-full transition-all ${proteinPct >= 100 ? 'bg-emerald-500' : 'bg-sky-500'}`}
            style={{ width: `${proteinPct}%` }}
          />
        </div>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Calories vs target"
      >
        <div className={`h-full ${status.bar} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <p className={`mt-1.5 text-right text-xs font-medium ${status.text}`}>
        {pct}% of target — {status.label}
      </p>
    </section>
  );
}
