import { useState } from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import {
  EXERCISE_EQUIPMENT,
  SELECTOR_GROUPS,
  getSelectorItems,
  isCardioGroup,
} from '~/lib/fittrack-exercises';
import type { CardioEquipment, Exercise, ExerciseEquipment } from '~/lib/types';

interface ExerciseSelectorProps {
  onAdd: (exercise: Exercise, sets: number, reps: number, weight: number) => void;
  onAddCardio: (equipment: CardioEquipment, durationMinutes: number, distanceMiles: number) => void;
  title?: string;
  addLabel?: string;
  /** IDs already in the workout/routine — shown with a check + "Already added". */
  addedIds?: string[];
  /**
   * When false the result list flows in the page scroll instead of an inner
   * scroll region — mid-workout the nested scroll area is a touch trap.
   */
  scrollableList?: boolean;
}

interface StepperProps {
  label: string;
  display: string;
  onDecrement: () => void;
  onIncrement: () => void;
}

function isStrengthExercise(item: Exercise | CardioEquipment): item is Exercise {
  return 'muscleGroup' in item;
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
          className="flex min-h-11 min-w-11 items-center justify-center text-slate-500 transition-colors hover:text-emerald-500 dark:text-slate-400"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold tabular-nums">{display}</span>
        <button
          type="button"
          onClick={onIncrement}
          aria-label={`Increase ${label.toLowerCase()}`}
          className="flex min-h-11 min-w-11 items-center justify-center text-slate-500 transition-colors hover:text-emerald-500 dark:text-slate-400"
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
  scrollableList = true,
}: ExerciseSelectorProps) {
  const [group, setGroup] = useState<string>(SELECTOR_GROUPS[0]);
  const [query, setQuery] = useState('');
  const [equipment, setEquipment] = useState<ExerciseEquipment | ''>('');
  const [selected, setSelected] = useState<Exercise | CardioEquipment | null>(null);
  const [sets, setSets] = useState(3);
  const [reps, setReps] = useState(10);
  const [weight, setWeight] = useState(50);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [distanceMiles, setDistanceMiles] = useState(0);

  const cardioMode = isCardioGroup(group);
  const queryReady = query.trim().length >= 2;
  const equipmentReady = equipment !== '';
  // Empty-until-filter: avoid dumping the full commercial catalog on first paint.
  const listUnlocked = cardioMode || queryReady || equipmentReady || group !== SELECTOR_GROUPS[0];
  const items = listUnlocked ? getSelectorItems(group, { query, equipment }) : [];
  const selectedAlreadyAdded = selected !== null && addedIds.includes(selected.id);

  function handleAdd() {
    if (!selected) return;
    if (isStrengthExercise(selected)) {
      onAdd(selected, sets, reps, weight);
    } else {
      onAddCardio(selected, durationMinutes, distanceMiles);
    }
    setSelected(null);
  }

  return (
    <section className="card" aria-label={title}>
      <h2 className="section-title">{title}</h2>

      <div className={`mb-3 grid gap-2 ${cardioMode ? '' : 'grid-cols-[minmax(0,1fr)_auto]'}`}>
        <label className="sr-only" htmlFor="exercise-search">
          Search exercises
        </label>
        <input
          id="exercise-search"
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(null);
          }}
          placeholder={cardioMode ? 'Search cardio equipment' : 'Search exercises'}
          className="field px-3 py-2 text-sm"
        />
        {!cardioMode && (
          <div>
            <label className="sr-only" htmlFor="exercise-equipment">
              Equipment
            </label>
            <select
              id="exercise-equipment"
              value={equipment}
              onChange={(event) => {
                setEquipment(event.target.value as ExerciseEquipment | '');
                setSelected(null);
              }}
              className="field min-w-32 px-2 py-2 text-sm"
            >
              <option value="">All equipment</option>
              {EXERCISE_EQUIPMENT.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

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
            className={`chip shrink-0 ${group === g ? 'chip-selected' : ''}`}
          >
            {g}
          </button>
        ))}
      </div>

      {!listUnlocked ? (
        <p className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">
          Search by name, pick equipment, or choose a muscle group to browse exercises.
        </p>
      ) : items.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">
          No exercises match the selected filters.
        </p>
      ) : (
        <div
          className={`mb-3 space-y-1.5 ${scrollableList ? 'max-h-56 overflow-y-auto pr-1' : ''}`}
        >
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
                    ? 'border-slate-900 bg-slate-100 font-semibold dark:border-slate-300 dark:bg-slate-700'
                    : 'border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600'
                }`}
              >
                <span className="min-w-0">
                  <span className="block">{item.name}</span>
                  {isStrengthExercise(item) && (
                    <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">
                      {item.equipment} · {item.muscleGroup}
                    </span>
                  )}
                </span>
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
