import { useState } from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import { SELECTOR_GROUPS, getSelectorItems, isCardioGroup } from '~/lib/fittrack-exercises';
import type { CardioEquipment, Exercise } from '~/lib/types';

interface ExerciseSelectorProps {
  onAdd: (exercise: Exercise, sets: number, reps: number, weight: number) => void;
  onAddCardio: (equipment: CardioEquipment, durationMinutes: number, distanceMiles: number) => void;
  title?: string;
  addLabel?: string;
  /** IDs already in the workout/routine — shown with a check + "Already added". */
  addedIds?: string[];
}

interface StepperProps {
  label: string;
  display: string;
  onDecrement: () => void;
  onIncrement: () => void;
}

function Stepper({ label, display, onDecrement, onIncrement }: StepperProps) {
  return (
    <div>
      <span className="label text-xs">{label}</span>
      <div className="flex items-center justify-between rounded-xl border border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900">
        <button
          type="button"
          onClick={onDecrement}
          aria-label={`Decrease ${label.toLowerCase()}`}
          className="p-2.5 text-slate-500 transition-colors hover:text-emerald-500 dark:text-slate-400"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold tabular-nums">{display}</span>
        <button
          type="button"
          onClick={onIncrement}
          aria-label={`Increase ${label.toLowerCase()}`}
          className="p-2.5 text-slate-500 transition-colors hover:text-emerald-500 dark:text-slate-400"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** Browse exercises by muscle group (plus cardio equipment) and add them with targets. */
export function ExerciseSelector({
  onAdd,
  onAddCardio,
  title = 'Add Exercise',
  addLabel = 'Add to Workout',
  addedIds = [],
}: ExerciseSelectorProps) {
  const [group, setGroup] = useState<string>(SELECTOR_GROUPS[0]);
  const [selected, setSelected] = useState<Exercise | CardioEquipment | null>(null);
  const [sets, setSets] = useState(3);
  const [reps, setReps] = useState(10);
  const [weight, setWeight] = useState(50);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [distanceMiles, setDistanceMiles] = useState(0);

  const cardioMode = isCardioGroup(group);
  const items = getSelectorItems(group);
  const selectedAlreadyAdded = selected !== null && addedIds.includes(selected.id);

  function handleAdd() {
    if (!selected) return;
    if (cardioMode) {
      onAddCardio(selected as CardioEquipment, durationMinutes, distanceMiles);
    } else {
      onAdd(selected as Exercise, sets, reps, weight);
    }
    setSelected(null);
  }

  return (
    <section className="card" aria-label={title}>
      <h2 className="section-title">{title}</h2>

      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Muscle groups">
        {SELECTOR_GROUPS.map((g) => (
          <button
            key={g}
            type="button"
            role="tab"
            aria-selected={group === g}
            onClick={() => {
              setGroup(g);
              setSelected(null);
            }}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              group === g
                ? 'bg-emerald-500 text-white'
                : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">
          No exercises found for {group}.
        </p>
      ) : (
        <div className="mb-3 max-h-56 space-y-1.5 overflow-y-auto pr-1">
          {items.map((item) => {
            const isSelected = selected?.id === item.id;
            const alreadyAdded = addedIds.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelected(isSelected ? null : item)}
                className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                  isSelected
                    ? 'border-emerald-500 bg-emerald-50 font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                    : 'border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600'
                }`}
              >
                <span>{item.name}</span>
                {alreadyAdded && (
                  <Check className="h-4 w-4 shrink-0 text-emerald-500" aria-label="Already added" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="space-y-3 border-t border-slate-200 pt-3 dark:border-slate-700/60">
          {cardioMode ? (
            <div className="grid grid-cols-2 gap-2">
              <Stepper
                label="Duration"
                display={`${durationMinutes} min`}
                onDecrement={() => setDurationMinutes((v) => Math.max(5, v - 5))}
                onIncrement={() => setDurationMinutes((v) => Math.min(240, v + 5))}
              />
              <Stepper
                label="Miles"
                display={`${distanceMiles} mi`}
                onDecrement={() => setDistanceMiles((v) => Math.max(0, Number((v - 0.25).toFixed(2))))}
                onIncrement={() => setDistanceMiles((v) => Math.min(50, Number((v + 0.25).toFixed(2))))}
              />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <Stepper
                label="Sets"
                display={String(sets)}
                onDecrement={() => setSets((v) => Math.max(1, v - 1))}
                onIncrement={() => setSets((v) => Math.min(20, v + 1))}
              />
              <Stepper
                label="Reps"
                display={String(reps)}
                onDecrement={() => setReps((v) => Math.max(1, v - 1))}
                onIncrement={() => setReps((v) => Math.min(100, v + 1))}
              />
              <div>
                <label htmlFor="selector-weight" className="label text-xs">
                  Weight (lb)
                </label>
                <input
                  id="selector-weight"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={999}
                  value={weight}
                  onChange={(e) => setWeight(Math.min(999, Math.max(0, Number(e.target.value) || 0)))}
                  className="field px-2 py-2 text-sm"
                />
              </div>
            </div>
          )}

          {selectedAlreadyAdded ? (
            <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 py-3 text-sm font-semibold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
              <Check className="h-4 w-4" />
              Already added
            </div>
          ) : (
            <button type="button" onClick={handleAdd} className="btn-primary">
              <Plus className="h-4 w-4" aria-hidden />
              {addLabel}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
