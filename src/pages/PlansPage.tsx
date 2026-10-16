import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { PageHeader } from '~/components/PageHeader';
import { TrainingTabs } from '~/components/TrainingTabs';
import { useAuth } from '~/context/AuthContext';
import { EXERCISES } from '~/lib/fittrack-exercises';
import {
  getPlan,
  listCustomExercises,
  listPlans,
  saveCustomExercise,
  savePlan,
  setActivePlan,
  type CustomExercise,
  type PlanSummary,
  type TrainingPlan,
} from '~/lib/plan-repo';
import {
  applyWeekPreview,
  copyDay,
  estimateSessionMinutes,
  previewNextWeek,
  type PlanDayDraft,
  type PlanExerciseDraft,
  type PlanFocus,
  type PlanLevel,
  type WeekChange,
  type ScoredSet,
} from '~/lib/training-surface';
import { WEEKDAYS, createWorkoutExercise, getTodayWeekday } from '~/lib/workout-mappers';
import { saveWorkoutState, getWorkoutHistory } from '~/lib/workout-repo';

const FOCI: PlanFocus[] = ['bulking', 'maintaining', 'cutting', 'sport'];
const LEVELS: PlanLevel[] = ['beginner', 'intermediate', 'advanced'];

function blankPlan(): TrainingPlan {
  return {
    id: '',
    name: 'My plan',
    focus: 'maintaining',
    level: 'intermediate',
    description: '',
    weekCount: 4,
    currentWeek: 1,
    active: false,
    days: WEEKDAYS.map((weekday, dayIndex) => ({
      weekIndex: 1,
      dayIndex,
      weekday,
      name: weekday,
      restDay: dayIndex > 4,
      exercises: [],
    })),
  };
}

function workingSet(index: number): PlanExerciseDraft['sets'][number] {
  return {
    setIndex: index,
    setType: 'working',
    reps: 8,
    weight: 0,
    durationSeconds: null,
    restSeconds: 90,
  };
}

export default function PlansPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [plan, setPlan] = useState<TrainingPlan>(blankPlan);
  const [week, setWeek] = useState(1);
  const [dayIndex, setDayIndex] = useState(0);
  const [custom, setCustom] = useState<CustomExercise[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<WeekChange[] | null>(null);
  const [lastByExercise, setLastByExercise] = useState<Record<string, ScoredSet[]>>({});
  const [customName, setCustomName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaries, customRows] = await Promise.all([listPlans(), listCustomExercises()]);
      setPlans(summaries);
      setCustom(customRows);
      const active = summaries.find((item) => item.active) ?? summaries[0];
      if (active) setPlan(await getPlan(active.id));
      if (user) {
        const history = await getWorkoutHistory(user.id);
        const latest: Record<string, ScoredSet[]> = {};
        for (const entry of history) {
          for (const exercise of entry.exercises) {
            if (latest[exercise.exercise.id]) continue;
            const completed = exercise.sets.filter((set) => set.completed);
            if (completed.length > 0) latest[exercise.exercise.id] = completed;
          }
        }
        setLastByExercise(latest);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load plans');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load, user]);

  const day = plan.days.find((item) => item.weekIndex === week && item.dayIndex === dayIndex);
  const library = useMemo(() => {
    const catalog = [
      ...EXERCISES.map((exercise) => ({
        id: exercise.id,
        name: exercise.name,
        muscleGroup: exercise.muscleGroup,
        equipment: exercise.equipment ?? 'Other',
      })),
      ...custom.map((exercise) => ({
        id: exercise.id,
        name: exercise.name,
        muscleGroup: exercise.muscleGroup,
        equipment: exercise.equipment,
      })),
    ];
    const needle = query.trim().toLowerCase();
    return needle ? catalog.filter((item) => item.name.toLowerCase().includes(needle)) : catalog.slice(0, 12);
  }, [custom, query]);

  function updateDay(next: PlanDayDraft) {
    setPlan((current) => ({
      ...current,
      days: current.days.some((item) => item.weekIndex === next.weekIndex && item.dayIndex === next.dayIndex)
        ? current.days.map((item) =>
            item.weekIndex === next.weekIndex && item.dayIndex === next.dayIndex ? next : item,
          )
        : [...current.days, next],
    }));
  }

  function ensureWeek(nextWeek: number) {
    setPlan((current) => {
      const missing = WEEKDAYS.flatMap((weekday, index) => {
        const exists = current.days.some((day) => day.weekIndex === nextWeek && day.dayIndex === index);
        return exists
          ? []
          : [{ weekIndex: nextWeek, dayIndex: index, weekday, name: weekday, restDay: false, exercises: [] }];
      });
      return { ...current, weekCount: Math.max(current.weekCount, nextWeek), days: [...current.days, ...missing] };
    });
    setWeek(nextWeek);
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const id = await savePlan(plan);
      setPlan((current) => ({ ...current, id }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the plan');
    } finally {
      setSaving(false);
    }
  }

  async function handleStart() {
    if (!user || !day || day.restDay) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    await saveWorkoutState({
      date: today,
      cardioExercises: [],
      exercises: day.exercises.map((exercise) => {
        const created = createWorkoutExercise(
          { id: exercise.exerciseId, name: exercise.name, muscleGroup: exercise.muscleGroup },
          exercise.sets.length || 1,
          exercise.sets[0]?.reps ?? 8,
          exercise.sets[0]?.weight ?? 0,
        );
        created.logType = exercise.logType;
        created.notes = exercise.notes;
        created.restSeconds = exercise.restSeconds;
        created.supersetGroup = exercise.supersetGroup;
        created.sets = exercise.sets.map((set) => ({
          reps: set.reps ?? 0,
          weight: set.weight ?? 0,
          rir: null,
          completed: false,
          setType: set.setType,
          durationSeconds: set.durationSeconds,
        }));
        return created;
      }),
    });
    navigate('/training');
  }

  return (
    <div>
      <PageHeader title="Plans" subtitle="Named plans, weeks, and the day you will actually lift" />
      <TrainingTabs active="routines" />
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-500" aria-label="Loading plans" />
        </div>
      ) : (
        <div className="space-y-4">
          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex flex-wrap gap-2">
            {plans.map((item) => (
              <button
                key={item.id}
                type="button"
                className="min-h-11 rounded-xl border border-slate-300 px-3 text-sm font-semibold dark:border-slate-600"
                onClick={() => void getPlan(item.id).then(setPlan)}
              >
                {item.name}
                {item.active ? ' · active' : ''}
              </button>
            ))}
            <button type="button" className="btn-primary" onClick={() => setPlan(blankPlan())}>
              New plan
            </button>
          </div>

          <section className="card space-y-3" aria-label="Plan identity">
            <label className="label" htmlFor="plan-name">Name</label>
            <input id="plan-name" className="field" value={plan.name} onChange={(e) => setPlan({ ...plan, name: e.target.value })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold">
                Focus
                <select className="field mt-1" value={plan.focus} onChange={(e) => setPlan({ ...plan, focus: e.target.value as PlanFocus })}>
                  {FOCI.map((focus) => <option key={focus} value={focus}>{focus}</option>)}
                </select>
              </label>
              <label className="text-sm font-semibold">
                Level
                <select className="field mt-1" value={plan.level} onChange={(e) => setPlan({ ...plan, level: e.target.value as PlanLevel })}>
                  {LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
                </select>
              </label>
            </div>
            <label className="label" htmlFor="plan-description">Description</label>
            <textarea id="plan-description" className="field min-h-[5rem]" maxLength={500} value={plan.description} onChange={(e) => setPlan({ ...plan, description: e.target.value })} />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Week {plan.currentWeek} of {plan.weekCount}. Today is {getTodayWeekday()}.
            </p>
          </section>

          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Plan weeks">
            {Array.from({ length: plan.weekCount }, (_, index) => (
              <button key={index} type="button" className="min-h-11 rounded-xl px-3 text-sm font-semibold" onClick={() => ensureWeek(index + 1)}>
                Week {index + 1}
              </button>
            ))}
            {plan.weekCount < 12 && (
              <button type="button" className="min-h-11 rounded-xl border border-slate-300 px-3 text-sm dark:border-slate-600" onClick={() => ensureWeek(plan.weekCount + 1)}>
                Add week
              </button>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-[16rem_minmax(0,1fr)]">
            <div className="space-y-2">
              {WEEKDAYS.map((weekday, index) => {
                const item = plan.days.find((candidate) => candidate.weekIndex === week && candidate.dayIndex === index);
                return (
                  <button
                    key={weekday}
                    type="button"
                    onClick={() => setDayIndex(index)}
                    className={`card w-full py-3 text-left text-sm font-semibold ${dayIndex === index ? 'border-slate-900 dark:border-slate-200' : ''}`}
                  >
                    {weekday.slice(0, 3)} · {item?.restDay ? 'Rest' : item?.name || 'Training'} · {item ? estimateSessionMinutes(item) : 0} min
                  </button>
                );
              })}
            </div>
            <section className="card" aria-label="Day builder">
              {day && (
                <>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <input className="field" value={day.name} onChange={(e) => updateDay({ ...day, name: e.target.value })} aria-label="Day name" />
                    <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                      <input type="checkbox" checked={day.restDay} onChange={(e) => updateDay({ ...day, restDay: e.target.checked, exercises: e.target.checked ? [] : day.exercises })} />
                      Rest day
                    </label>
                    <button
                      type="button"
                      className="min-h-11 rounded-xl border border-slate-300 px-3 text-sm font-semibold dark:border-slate-600"
                      onClick={() => {
                        const target = (dayIndex + 1) % 7;
                        setPlan((current) => ({ ...current, days: copyDay(current.days, day, week, target) }));
                      }}
                    >
                      Copy to next day
                    </button>
                  </div>
                  {!day.restDay && day.exercises.map((exercise, exerciseIndex) => (
                    <div key={`${exercise.exerciseId}-${exerciseIndex}`} className="mb-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                      <p className="font-semibold">{exercise.name}</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-3">
                        <label className="text-xs font-semibold">
                          Rest seconds
                          <input className="field" type="number" min={0} max={600} value={exercise.restSeconds} onChange={(e) => {
                            const next = [...day.exercises];
                            next[exerciseIndex] = { ...exercise, restSeconds: Number(e.target.value) };
                            updateDay({ ...day, exercises: next });
                          }} />
                        </label>
                        <label className="text-xs font-semibold">
                          Superset
                          <input className="field" type="number" min={1} max={20} value={exercise.supersetGroup ?? ''} onChange={(e) => {
                            const next = [...day.exercises];
                            next[exerciseIndex] = { ...exercise, supersetGroup: e.target.value ? Number(e.target.value) : null };
                            updateDay({ ...day, exercises: next });
                          }} />
                        </label>
                        <label className="text-xs font-semibold">
                          Log type
                          <select className="field" value={exercise.logType} onChange={(e) => {
                            const next = [...day.exercises];
                            next[exerciseIndex] = { ...exercise, logType: e.target.value as PlanExerciseDraft['logType'] };
                            updateDay({ ...day, exercises: next });
                          }}>
                            <option value="weight_reps">Weight and reps</option>
                            <option value="reps">Reps</option>
                            <option value="duration">Duration</option>
                            <option value="reps_duration">Reps and duration</option>
                          </select>
                        </label>
                      </div>
                      <label className="mt-2 block text-xs font-semibold">
                        Note
                        <input className="field" value={exercise.notes} maxLength={500} onChange={(e) => {
                          const next = [...day.exercises];
                          next[exerciseIndex] = { ...exercise, notes: e.target.value };
                          updateDay({ ...day, exercises: next });
                        }} />
                      </label>
                    </div>
                  ))}
                  <label className="label" htmlFor="plan-library-search">Exercise library</label>
                  <input id="plan-library-search" className="field mb-2" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your catalog" />
                  <div className="max-h-64 space-y-1 overflow-y-auto">
                    {library.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="flex min-h-11 w-full items-center justify-between rounded-xl px-2 text-left text-sm"
                        onClick={() => day && updateDay({
                          ...day,
                          restDay: false,
                          exercises: [...day.exercises, {
                            exerciseId: item.id,
                            name: item.name,
                            muscleGroup: item.muscleGroup,
                            equipment: item.equipment,
                            logType: 'weight_reps',
                            restSeconds: 90,
                            supersetGroup: null,
                            notes: '',
                            sets: [workingSet(1), workingSet(2), workingSet(3)],
                          }],
                        })}
                      >
                        <span>{item.name}</span>
                        <span className="text-slate-500">{item.equipment}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </section>
          </div>

          <section className="card" aria-label="Custom exercise">
            <h2 className="section-title">Custom exercise</h2>
            <div className="flex flex-wrap gap-2">
              <input className="field" aria-label="Custom exercise name" value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Name" />
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  if (!user || !customName.trim()) return;
                  void saveCustomExercise(user.id, {
                    name: customName.trim(),
                    muscleGroup: 'Other',
                    equipment: 'Other',
                    logType: 'weight_reps',
                    cue: '',
                  }).then(() => {
                    setCustomName('');
                    return listCustomExercises().then(setCustom);
                  }).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not save the exercise'));
                }}
              >
                Add to my catalog
              </button>
            </div>
          </section>

          {preview && (
            <section className="card" aria-label="Next week preview">
              <h2 className="section-title">Next week, if you confirm</h2>
              {preview.length === 0 ? <p className="text-sm">No load changes from this week's logged work.</p> : preview.map((change) => (
                <p key={change.exerciseId} className="mb-2 text-sm">
                  <span className="font-semibold">{change.name}</span>: {change.from} → {change.to}. {change.reason}
                </p>
              ))}
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setPlan((current) => ({ ...current, days: applyWeekPreview(current.days, week, preview) }));
                  setPreview(null);
                }}
              >
                Apply to next week
              </button>
            </section>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={saving} onClick={() => void handleSave()}>
              {saving ? 'Saving…' : 'Save plan'}
            </button>
            <button type="button" className="min-h-11 rounded-xl border border-slate-300 px-3 text-sm font-semibold dark:border-slate-600" onClick={() => plan.id && void setActivePlan(plan.id).then(load)}>
              Make active
            </button>
            <button type="button" className="min-h-11 rounded-xl border border-slate-300 px-3 text-sm font-semibold dark:border-slate-600" onClick={() => setPreview(previewNextWeek(plan.days, week, lastByExercise))}>
              Preview next week
            </button>
            <button type="button" className="min-h-11 rounded-xl border border-slate-300 px-3 text-sm font-semibold dark:border-slate-600" onClick={() => void handleStart()}>
              Start this day
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
