import { TARGETS } from '~/lib/constants';

interface DayMacroSummaryProps {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/**
 * Daily totals bar for the macro tracker. Color-coded against the calorie
 * range: green in range, amber under (day in progress), red over.
 */
export function DayMacroSummary({ calories, protein, carbs, fat }: DayMacroSummaryProps) {
  const pct = Math.min(100, Math.round((calories / TARGETS.calories) * 100));
  const status =
    calories > TARGETS.caloriesMax
      ? { bar: 'bg-red-500', text: 'text-red-600 dark:text-red-400', label: 'over target' }
      : calories >= TARGETS.caloriesMin
        ? { bar: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', label: 'on track' }
        : calories >= TARGETS.caloriesMin * 0.8
          ? { bar: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', label: 'close' }
          : { bar: 'bg-slate-400', text: 'text-slate-500 dark:text-slate-400', label: 'in progress' };

  const cells = [
    { label: 'Calories', value: calories.toLocaleString(), target: TARGETS.calories.toLocaleString() },
    { label: 'Protein', value: `${Math.round(protein)}g`, target: `${TARGETS.proteinG}g` },
    { label: 'Carbs', value: `${Math.round(carbs)}g`, target: `${TARGETS.carbsG}g` },
    { label: 'Fat', value: `${Math.round(fat)}g`, target: `${TARGETS.fatG}g` },
  ];

  return (
    <section className="card sticky bottom-24 z-10 shadow-lg" aria-label="Daily total">
      <h2 className="section-title mb-3">Daily total</h2>
      <div className="mb-3 grid grid-cols-4 gap-2 text-center">
        {cells.map(({ label, value, target }) => (
          <div key={label}>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">{label}</p>
            <p className="text-base font-bold tabular-nums">{value}</p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">/ {target}</p>
          </div>
        ))}
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
