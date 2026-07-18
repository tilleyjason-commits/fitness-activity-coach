import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { useDailyLog } from '~/hooks/useDailyLog';
import { getExerciseLogs, replaceExerciseLogs } from '~/lib/db';
import {
  SESSION_TEMPLATES,
  SESSION_TYPES,
  WEEKDAY_SESSIONS,
  type SessionType,
} from '~/lib/constants';
import type { DailyLog, ExerciseLog, ExerciseLogInsert } from '~/lib/types';
import { PageHeader } from '~/components/PageHeader';
import { ToggleRow } from '~/components/ToggleRow';

interface ExerciseEntry {
  sets: string;
  reps: string;
  weight: string;
  rir: string;
}

const EMPTY_ENTRY: ExerciseEntry = { sets: '', reps: '', weight: '', rir: '' };
const RIR_OPTIONS = ['0', '1', '2', '3', '4'];

function toStr(value: number | null): string {
  return value === null ? '' : String(value);
}

function toNum(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}

function defaultSession(date: string): SessionType {
  return WEEKDAY_SESSIONS[format(parseISO(date), 'EEEE')] ?? 'Upper A';
}

export default function LogTraining() {
  const navigate = useNavigate();
  const today = format(new Date(), 'yyyy-MM-dd');
  const [date, setDate] = useState(today);
  const { log, loading, saving, error, save } = useDailyLog(date);

  const [session, setSession] = useState<SessionType>(() => defaultSession(today));
  const [entries, setEntries] = useState<ExerciseEntry[]>([]);
  const [savedExercises, setSavedExercises] = useState<ExerciseLog[]>([]);
  const [compoundRir, setCompoundRir] = useState('');
  const [isolationRir, setIsolationRir] = useState('');
  const [doubleProgression, setDoubleProgression] = useState(false);
  const [squatDone, setSquatDone] = useState(false);
  const [ohpDone, setOhpDone] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Prefill from an existing row for the selected date (or reset when there is none).
  useEffect(() => {
    if (loading) return;
    if (!log) {
      setSession(defaultSession(date));
      setSavedExercises([]);
      setCompoundRir('');
      setIsolationRir('');
      setDoubleProgression(false);
      setSquatDone(false);
      setOhpDone(false);
      return;
    }
    if (
      log.training_session_type &&
      (SESSION_TYPES as string[]).includes(log.training_session_type)
    ) {
      setSession(log.training_session_type as SessionType);
    }
    setCompoundRir(toStr(log.compound_rir));
    setIsolationRir(toStr(log.isolation_rir));
    setDoubleProgression(log.double_progression_followed ?? false);
    setSquatDone(log.barbell_squat_done);
    setOhpDone(log.barbell_ohp_done);
    getExerciseLogs([log.id])
      .then(setSavedExercises)
      .catch(() => setSavedExercises([]));
  }, [log, loading, date]);

  // Rebuild the entry grid from the session template, keeping any saved values.
  useEffect(() => {
    const template = SESSION_TEMPLATES[session];
    setEntries(
      template.map((exercise) => {
        const saved = savedExercises.find(
          (e) => e.exercise_name.toLowerCase() === exercise.name.toLowerCase(),
        );
        if (!saved) return { ...EMPTY_ENTRY };
        return {
          sets: toStr(saved.sets_completed),
          reps: toStr(saved.reps_completed),
          weight: toStr(saved.weight_lb),
          rir: toStr(saved.rir),
        };
      }),
    );
  }, [session, savedExercises]);

  function updateEntry(index: number, field: keyof ExerciseEntry, value: string) {
    setEntries((current) =>
      current.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry)),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError(null);

    const patch: Partial<DailyLog> = {
      training_done: true,
      training_session_type: session,
      compound_rir: toNum(compoundRir),
      isolation_rir: toNum(isolationRir),
      double_progression_followed: doubleProgression,
      barbell_squat_done: squatDone,
      barbell_ohp_done: ohpDone,
    };
    const saved = await save(patch);
    if (!saved) return;

    const template = SESSION_TEMPLATES[session];
    const inserts: ExerciseLogInsert[] = [];
    template.forEach((exercise, index) => {
      const entry = entries[index];
      if (!entry) return;
      const hasData = [entry.sets, entry.reps, entry.weight, entry.rir].some(
        (v) => v.trim() !== '',
      );
      if (!hasData) return;
      inserts.push({
        daily_log_id: saved.id,
        exercise_name: exercise.name,
        sets_completed: toNum(entry.sets),
        target_sets: exercise.sets,
        reps_completed: toNum(entry.reps),
        target_reps: exercise.reps,
        weight_lb: toNum(entry.weight),
        rir: toNum(entry.rir),
        notes: null,
      });
    });

    try {
      await replaceExerciseLogs(saved.id, inserts);
      navigate('/');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save exercises');
    }
  }

  const template = SESSION_TEMPLATES[session];

  return (
    <form onSubmit={handleSubmit}>
      <PageHeader title="Log Training" subtitle="Session, exercises, and effort" backTo="/" />

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="date" className="label">
            Date
          </label>
          <input
            id="date"
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="field"
          />
        </div>
        <div>
          <label htmlFor="session" className="label">
            Session
          </label>
          <select
            id="session"
            value={session}
            onChange={(e) => setSession(e.target.value as SessionType)}
            className="field"
          >
            {SESSION_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="mb-4 space-y-3" aria-label="Exercises">
        <h2 className="section-title">Exercises</h2>
        {template.map((exercise, index) => {
          const entry = entries[index] ?? EMPTY_ENTRY;
          return (
            <div key={exercise.name} className="card">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold">{exercise.name}</span>
                <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                  target {exercise.sets} × {exercise.reps}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label htmlFor={`sets-${index}`} className="label text-xs">
                    Sets
                  </label>
                  <input
                    id={`sets-${index}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={10}
                    value={entry.sets}
                    onChange={(e) => updateEntry(index, 'sets', e.target.value)}
                    className="field px-2 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor={`reps-${index}`} className="label text-xs">
                    Reps
                  </label>
                  <input
                    id={`reps-${index}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={50}
                    value={entry.reps}
                    onChange={(e) => updateEntry(index, 'reps', e.target.value)}
                    className="field px-2 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor={`weight-${index}`} className="label text-xs">
                    Lb
                  </label>
                  <input
                    id={`weight-${index}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.5"
                    value={entry.weight}
                    onChange={(e) => updateEntry(index, 'weight', e.target.value)}
                    className="field px-2 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor={`rir-${index}`} className="label text-xs">
                    RIR
                  </label>
                  <select
                    id={`rir-${index}`}
                    value={entry.rir}
                    onChange={(e) => updateEntry(index, 'rir', e.target.value)}
                    className="field px-2 py-2 text-sm"
                  >
                    <option value="">—</option>
                    {RIR_OPTIONS.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <section className="mb-4" aria-label="Session effort">
        <h2 className="section-title">Session effort</h2>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="compound-rir" className="label">
              Compound RIR
            </label>
            <select
              id="compound-rir"
              value={compoundRir}
              onChange={(e) => setCompoundRir(e.target.value)}
              className="field"
            >
              <option value="">Not set</option>
              {RIR_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="isolation-rir" className="label">
              Isolation RIR
            </label>
            <select
              id="isolation-rir"
              value={isolationRir}
              onChange={(e) => setIsolationRir(e.target.value)}
              className="field"
            >
              <option value="">Not set</option>
              {RIR_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-3">
          <ToggleRow
            label="Double progression followed"
            description="Reps to top of range before adding weight"
            checked={doubleProgression}
            onChange={setDoubleProgression}
          />
          <ToggleRow
            label="Barbell squat done"
            description="Not in the program — flagged as knee risk"
            checked={squatDone}
            onChange={setSquatDone}
          />
          <ToggleRow
            label="Barbell OHP done"
            description="Not in the program — flagged as shoulder risk"
            checked={ohpDone}
            onChange={setOhpDone}
          />
        </div>
      </section>

      {(error || saveError) && <p className="mb-3 text-sm text-red-500">{error ?? saveError}</p>}

      <button type="submit" disabled={saving || loading} className="btn-primary">
        {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        Save training
      </button>
    </form>
  );
}
