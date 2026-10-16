import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { useAuth } from '~/context/AuthContext';
import { getLogsBetween, getProfile } from '~/lib/db';
import {
  listMeasurements,
  listPhotos,
  saveMeasurement,
  uploadProgressPhoto,
  type BodyMeasurement,
  type ProgressPhoto,
} from '~/lib/plan-repo';
import {
  buildMonthGrid,
  muscleBalance,
  strengthHistory,
  toCsv,
  type ScoredExercise,
} from '~/lib/training-surface';
import { getWorkoutHistory } from '~/lib/workout-repo';
import type { WorkoutHistoryEntry } from '~/lib/types';

function scored(history: WorkoutHistoryEntry[]): { date: string; exercises: ScoredExercise[] }[] {
  return history.map((entry) => ({
    date: entry.date,
    exercises: entry.exercises.map((exercise) => ({
      id: exercise.exercise.id,
      name: exercise.exercise.name,
      muscleGroup: exercise.exercise.muscleGroup,
      sets: exercise.sets,
    })),
  }));
}

export function ProgressSurfaces({ lens }: { lens: 'calendar' | 'body' | 'strength' }) {
  const { user } = useAuth();
  const [history, setHistory] = useState<WorkoutHistoryEntry[]>([]);
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([]);
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [goal, setGoal] = useState<number | null>(null);
  const [selected, setSelected] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [chest, setChest] = useState('');
  const [waistNote, setWaistNote] = useState('');

  useEffect(() => {
    if (!user) return;
    let active = true;
    Promise.all([getWorkoutHistory(user.id), listMeasurements(), listPhotos(), getProfile(user.id)])
      .then(([workouts, measured, images, profile]) => {
        if (!active) return;
        setHistory(workouts);
        setMeasurements(measured);
        setPhotos(images);
        setGoal(profile?.goal_weight_lb ?? null);
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : 'Could not load progress');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user]);

  const month = useMemo(() => {
    const date = new Date(`${selected}T00:00:00`);
    return buildMonthGrid(date.getFullYear(), date.getMonth());
  }, [selected]);
  const workoutDates = new Set(history.map((entry) => entry.date));
  const photoDates = new Set(photos.map((photo) => photo.takenOn));
  const measureDates = new Set(measurements.map((row) => row.measuredOn));
  const selectedWorkouts = history.filter((entry) => entry.date === selected);
  const sessions = scored(history);
  const balance = muscleBalance(sessions.flatMap((session) => session.exercises));
  const names = [...new Map(sessions.flatMap((session) => session.exercises.map((exercise) => [exercise.id, exercise.name]))).entries()];

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-emerald-500" aria-label="Loading progress" /></div>;
  }
  if (error) return <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>;

  if (lens === 'calendar') {
    return (
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid grid-cols-7 gap-1" aria-label="Training calendar">
          {month.map((cell) => {
            const marks = [
              workoutDates.has(cell.date) ? 'workout' : '',
              photoDates.has(cell.date) ? 'photo' : '',
              measureDates.has(cell.date) ? 'measure' : '',
            ].filter(Boolean);
            return (
              <button
                key={cell.date}
                type="button"
                onClick={() => setSelected(cell.date)}
                className={`min-h-11 rounded-lg text-xs ${cell.inMonth ? '' : 'opacity-40'} ${selected === cell.date ? 'bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-900' : 'bg-white dark:bg-slate-800'}`}
              >
                {Number(cell.date.slice(-2))}
                <span className="block text-[10px]">{marks.join(' ')}</span>
              </button>
            );
          })}
        </div>
        <section className="card" aria-label="Selected day">
          <h2 className="section-title">{selected}</h2>
          {selectedWorkouts.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No workout logged.</p>
          ) : selectedWorkouts.map((entry) => (
            <div key={entry.id} className="mb-3 text-sm">
              {entry.exercises.map((exercise) => (
                <p key={exercise.exercise.id}>{exercise.exercise.name}: {exercise.sets.filter((set) => set.completed).length} sets</p>
              ))}
            </div>
          ))}
        </section>
      </div>
    );
  }

  if (lens === 'body') {
    return (
      <div className="space-y-4">
        <section className="card">
          <h2 className="section-title">Goal</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {goal === null ? 'Set a goal weight in More to draw the line on the weight chart.' : `Goal weight: ${goal} lb. The week chart draws this as a line.`}
          </p>
          <form
            className="mt-3 flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!user) return;
              void saveMeasurement(user.id, {
                measuredOn: format(new Date(), 'yyyy-MM-dd'),
                chestIn: chest ? Number(chest) : null,
                armIn: null,
                thighIn: null,
                hipIn: null,
                neckIn: null,
                calfIn: null,
                notes: waistNote,
              }).then(() => listMeasurements().then(setMeasurements));
            }}
          >
            <label className="text-sm font-semibold">
              Chest (in)
              <input className="field" value={chest} onChange={(e) => setChest(e.target.value)} inputMode="decimal" />
            </label>
            <label className="text-sm font-semibold">
              Note
              <input className="field" value={waistNote} onChange={(e) => setWaistNote(e.target.value)} />
            </label>
            <button type="submit" className="btn-primary">Save measurement</button>
          </form>
          <ul className="mt-3 space-y-1 text-sm">
            {measurements.map((row) => (
              <li key={row.id}>{row.measuredOn}: chest {row.chestIn ?? '—'} in {row.notes}</li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h2 className="section-title">Photos</h2>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Progress photo"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file || !user) return;
              void uploadProgressPhoto(user.id, file, format(new Date(), 'yyyy-MM-dd'), '').then(() => listPhotos().then(setPhotos));
            }}
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            {photos.map((photo) => (
              <figure key={photo.id}>
                {photo.url && <img src={photo.url} alt={photo.caption || `Progress photo ${photo.takenOn}`} className="rounded-xl" />}
                <figcaption className="text-xs text-slate-500">{photo.takenOn}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <section className="card" aria-label="Strength insights">
      <h2 className="section-title">Sets by muscle</h2>
      <ul className="mb-4 space-y-1 text-sm">
        {balance.byMuscle.map((row) => <li key={row.muscle}>{row.muscle}: {row.sets}</li>)}
      </ul>
      <p className="mb-4 text-sm">Push {balance.movement.push} · Pull {balance.movement.pull} · Legs {balance.movement.legs}</p>
      <h3 className="mb-2 font-semibold">Estimated 1RM</h3>
      {names.slice(0, 8).map(([id, name]) => {
        const points = strengthHistory(sessions, id);
        const latest = points.at(-1);
        return <p key={id} className="text-sm">{name}: {latest ? `${latest.e1rm} lb` : '—'}</p>;
      })}
    </section>
  );
}

export async function downloadTrainingCsv(userId: string): Promise<void> {
  const [history, logs] = await Promise.all([
    getWorkoutHistory(userId),
    getLogsBetween(userId, '2000-01-01', '2100-01-01'),
  ]);
  const measurements = await listMeasurements();
  const workoutCsv = toCsv(
    ['date', 'exercise', 'set', 'reps', 'weight_lb', 'rir', 'completed'],
    history.flatMap((entry) => entry.exercises.flatMap((exercise) => exercise.sets.map((set, index) => [
      entry.date, exercise.exercise.name, index + 1, set.reps, set.weight, set.rir, set.completed,
    ]))),
  );
  const logCsv = toCsv(
    ['date', 'weight_lb', 'waist_in', 'notes'],
    logs.map((log) => [log.log_date, log.weekly_weight_lb, log.weekly_waist_inches, log.notes]),
  );
  const bodyCsv = toCsv(
    ['date', 'chest_in', 'arm_in', 'thigh_in', 'hip_in', 'neck_in', 'calf_in', 'notes'],
    measurements.map((row) => [row.measuredOn, row.chestIn, row.armIn, row.thighIn, row.hipIn, row.neckIn, row.calfIn, row.notes]),
  );
  const blob = new Blob([`workouts\n${workoutCsv}\n\ndaily_logs\n${logCsv}\n\nmeasurements\n${bodyCsv}\n`], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'fitness-coach-export.csv';
  link.click();
  URL.revokeObjectURL(url);
}
