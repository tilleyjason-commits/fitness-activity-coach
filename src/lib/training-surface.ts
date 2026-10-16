/**
 * Local training math for the session scorecard, records, muscle balance,
 * mesocycle preview, calendar marks, and CSV export. No network. Cues are
 * original short form notes, not copied from another app.
 */

export type LogType = 'weight_reps' | 'reps' | 'duration' | 'reps_duration';
export type SetKind = 'working' | 'warmup';
export type PlanFocus = 'bulking' | 'maintaining' | 'cutting' | 'sport';
export type PlanLevel = 'beginner' | 'intermediate' | 'advanced';

export interface ScoredSet {
  reps: number;
  weight: number;
  completed: boolean;
  rir?: number | null;
  setType?: SetKind;
  durationSeconds?: number | null;
}

export interface ScoredExercise {
  id: string;
  name: string;
  muscleGroup: string;
  sets: ScoredSet[];
}

export interface SessionScorecard {
  exerciseCount: number;
  completedSets: number;
  volumeLb: number;
  elapsedSeconds: number | null;
  restSeconds: number | null;
  liftingSeconds: number | null;
  recordsBroken: string[];
}

export interface StrengthPoint {
  date: string;
  e1rm: number;
  weight: number;
  reps: number;
}

export interface MuscleCount {
  muscle: string;
  sets: number;
}

export interface MovementBalance {
  push: number;
  pull: number;
  legs: number;
  other: number;
}

export interface PlanSetDraft {
  setIndex: number;
  setType: SetKind;
  reps: number | null;
  weight: number | null;
  durationSeconds: number | null;
  restSeconds: number | null;
}

export interface PlanExerciseDraft {
  exerciseId: string;
  name: string;
  muscleGroup: string;
  equipment: string;
  logType: LogType;
  restSeconds: number;
  supersetGroup: number | null;
  notes: string;
  sets: PlanSetDraft[];
}

export interface PlanDayDraft {
  weekIndex: number;
  dayIndex: number;
  weekday: string | null;
  name: string;
  restDay: boolean;
  exercises: PlanExerciseDraft[];
}

export interface WeekChange {
  exerciseId: string;
  name: string;
  from: string;
  to: string;
  reason: string;
  sets: PlanSetDraft[];
}

const E1RM_REP_CAP = 12;

/** Epley estimate. Reps above 12 are ignored so a high-rep set does not invent a max. */
export function estimateE1rm(weight: number, reps: number): number | null {
  if (weight <= 0 || reps < 1 || reps > E1RM_REP_CAP) return null;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

export function bestE1rm(sets: ScoredSet[]): number | null {
  let best: number | null = null;
  for (const set of sets) {
    if (!set.completed || set.setType === 'warmup') continue;
    const value = estimateE1rm(set.weight, set.reps);
    if (value !== null && (best === null || value > best)) best = value;
  }
  return best;
}

export function buildScorecard(
  exercises: ScoredExercise[],
  options: {
    startedAt?: string | null;
    finishedAt?: string | null;
    restSeconds?: number | null;
    priorBest?: Record<string, number>;
  } = {},
): SessionScorecard {
  const completed = exercises.flatMap((exercise) =>
    exercise.sets.filter((set) => set.completed && set.setType !== 'warmup'),
  );
  const volumeLb = completed.reduce((sum, set) => sum + set.weight * set.reps, 0);
  const prior = options.priorBest ?? {};
  const recordsBroken = exercises
    .filter((exercise) => {
      const today = bestE1rm(exercise.sets);
      const before = prior[exercise.id];
      return today !== null && before !== undefined && today > before;
    })
    .map((exercise) => exercise.name);

  let elapsedSeconds: number | null = null;
  if (options.startedAt && options.finishedAt) {
    const delta = Math.round(
      (new Date(options.finishedAt).getTime() - new Date(options.startedAt).getTime()) / 1000,
    );
    elapsedSeconds = Number.isFinite(delta) && delta >= 0 ? delta : null;
  }
  const restSeconds = options.restSeconds ?? null;
  const liftingSeconds =
    elapsedSeconds === null || restSeconds === null
      ? null
      : Math.max(0, elapsedSeconds - restSeconds);

  return {
    exerciseCount: exercises.filter((exercise) =>
      exercise.sets.some((set) => set.completed),
    ).length,
    completedSets: completed.length,
    volumeLb: Math.round(volumeLb),
    elapsedSeconds,
    restSeconds,
    liftingSeconds,
    recordsBroken,
  };
}

export function strengthHistory(
  sessions: { date: string; exercises: ScoredExercise[] }[],
  exerciseId: string,
): StrengthPoint[] {
  const points: StrengthPoint[] = [];
  for (const session of sessions) {
    const match = session.exercises.find((exercise) => exercise.id === exerciseId);
    if (!match) continue;
    const e1rm = bestE1rm(match.sets);
    const bestSet = match.sets
      .filter((set) => set.completed && set.setType !== 'warmup' && set.weight > 0)
      .sort((a, b) => b.weight - a.weight || b.reps - a.reps)[0];
    if (e1rm === null || !bestSet) continue;
    points.push({ date: session.date, e1rm, weight: bestSet.weight, reps: bestSet.reps });
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

function armRole(name: string): 'push' | 'pull' | 'other' {
  const lower = name.toLowerCase();
  if (/tricep|pushdown|dip|extension|skull/.test(lower)) return 'push';
  if (/curl|bicep|chin/.test(lower)) return 'pull';
  return 'other';
}

export function muscleBalance(exercises: ScoredExercise[]): {
  byMuscle: MuscleCount[];
  movement: MovementBalance;
} {
  const counts = new Map<string, number>();
  const movement: MovementBalance = { push: 0, pull: 0, legs: 0, other: 0 };
  for (const exercise of exercises) {
    const sets = exercise.sets.filter((set) => set.completed && set.setType !== 'warmup').length;
    if (sets === 0) continue;
    counts.set(exercise.muscleGroup, (counts.get(exercise.muscleGroup) ?? 0) + sets);
    const group = exercise.muscleGroup.toLowerCase();
    if (group === 'chest' || group === 'shoulders') movement.push += sets;
    else if (group === 'back') movement.pull += sets;
    else if (group === 'legs' || group === 'glutes') movement.legs += sets;
    else if (group === 'arms') {
      const role = armRole(exercise.name);
      movement[role] += sets;
    } else movement.other += sets;
  }
  return {
    byMuscle: [...counts.entries()]
      .map(([muscle, sets]) => ({ muscle, sets }))
      .sort((a, b) => b.sets - a.sets || a.muscle.localeCompare(b.muscle)),
    movement,
  };
}

export function estimateSessionMinutes(day: PlanDayDraft): number {
  if (day.restDay) return 0;
  const seconds = day.exercises.reduce((sum, exercise) => {
    const work = exercise.sets.length * 40;
    const rest = exercise.sets.length * exercise.restSeconds;
    return sum + work + rest;
  }, 0);
  return Math.max(1, Math.round(seconds / 60));
}

function roundToFive(value: number): number {
  return Math.max(0, Math.round(value / 5) * 5);
}

function describeSets(sets: PlanSetDraft[]): string {
  const working = sets.filter((set) => set.setType !== 'warmup');
  if (working.length === 0) return 'no working sets';
  const first = working[0];
  if (first.durationSeconds && !first.reps) return `${working.length} × ${first.durationSeconds}s`;
  return `${working.length} × ${first.reps ?? 0} @ ${first.weight ?? 0}`;
}

/**
 * Propose next week's working-set targets from this week's completed sets.
 * Does not mutate the plan. The caller applies the result only after confirm.
 */
export function previewNextWeek(
  days: PlanDayDraft[],
  currentWeek: number,
  lastByExercise: Record<string, ScoredSet[]>,
): WeekChange[] {
  const changes: WeekChange[] = [];
  for (const day of days.filter((item) => item.weekIndex === currentWeek && !item.restDay)) {
    for (const exercise of day.exercises) {
      const logged = (lastByExercise[exercise.exerciseId] ?? []).filter(
        (set) => set.completed && set.setType !== 'warmup',
      );
      const working = exercise.sets.filter((set) => set.setType !== 'warmup');
      if (working.length === 0) continue;
      const targetReps = working[0].reps ?? 0;
      const targetWeight = working[0].weight ?? 0;
      let nextReps = targetReps;
      let nextWeight = targetWeight;
      let reason = 'Hold. Not enough completed work to change the load.';
      if (logged.length > 0) {
        const avgRir =
          logged.every((set) => set.rir === null || set.rir === undefined)
            ? null
            : logged.reduce((sum, set) => sum + (set.rir ?? 0), 0) / logged.length;
        const hitReps = logged.every((set) => set.reps + 1 >= targetReps);
        const missed = logged.some((set) => set.reps <= targetReps - 2);
        if (missed && avgRir !== null && avgRir <= 1 && targetWeight > 0) {
          nextWeight = roundToFive(targetWeight * 0.9);
          reason = 'Deload 10%. Reps were short and the set was at or near failure.';
        } else if (missed || avgRir === null) {
          reason = missed
            ? 'Hold. Reps came up short of the plan.'
            : 'Hold. Log RIR before the load changes.';
        } else if (avgRir >= 3) {
          if (targetReps >= 12) {
            nextWeight = targetWeight + 5;
            nextReps = Math.min(targetReps, 8);
            reason = 'Reps are already high with reps in reserve. Add load and reset the rep target.';
          } else {
            nextReps = targetReps + 1;
            reason = 'Reps in reserve were high. Add a rep before adding load.';
          }
        } else if (avgRir <= 1 && hitReps) {
          nextWeight = targetWeight + 5;
          reason = 'Target reps were hit near failure. Add 5 lb and keep the reps.';
        } else {
          reason = 'Hold. The set was in the working range.';
        }
      }
      const nextSets = exercise.sets.map((set) =>
        set.setType === 'warmup'
          ? set
          : { ...set, reps: set.reps === null ? null : nextReps, weight: set.weight === null ? null : nextWeight },
      );
      const changed = nextSets.some(
        (set, index) => set.reps !== exercise.sets[index].reps || set.weight !== exercise.sets[index].weight,
      );
      if (!changed && reason.startsWith('Hold')) continue;
      changes.push({
        exerciseId: exercise.exerciseId,
        name: exercise.name,
        from: describeSets(exercise.sets),
        to: describeSets(nextSets),
        reason,
        sets: nextSets,
      });
    }
  }
  return changes;
}

export function applyWeekPreview(days: PlanDayDraft[], currentWeek: number, changes: WeekChange[]): PlanDayDraft[] {
  const byId = new Map(changes.map((change) => [change.exerciseId, change]));
  return days.map((day) => {
    if (day.weekIndex !== currentWeek + 1) return day;
    return {
      ...day,
      exercises: day.exercises.map((exercise) => {
        const change = byId.get(exercise.exerciseId);
        return change ? { ...exercise, sets: change.sets } : exercise;
      }),
    };
  });
}

export function copyDay(days: PlanDayDraft[], from: PlanDayDraft, weekIndex: number, dayIndex: number): PlanDayDraft[] {
  const clone: PlanDayDraft = {
    ...from,
    weekIndex,
    dayIndex,
    exercises: from.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => ({ ...set })),
    })),
  };
  const rest = days.filter((day) => !(day.weekIndex === weekIndex && day.dayIndex === dayIndex));
  return [...rest, clone].sort((a, b) => a.weekIndex - b.weekIndex || a.dayIndex - b.dayIndex);
}

export interface CatalogExercise {
  id: string;
  name: string;
  muscleGroup: string;
  equipment?: string;
}

export function exerciseCue(exercise: CatalogExercise): string {
  const name = exercise.name.toLowerCase();
  if (name.includes('squat')) return 'Brace, sit between the hips, and stand without letting the knees cave.';
  if (/deadlift|hinge|romanian/.test(name)) return 'Push the floor away and keep the load close. Stop if the lower back rounds.';
  if (name.includes('bench') || (name.includes('press') && exercise.muscleGroup === 'Chest')) {
    return 'Set the shoulders down, touch the chest, and press without bouncing.';
  }
  if (name.includes('row')) return 'Pull the elbow toward the hip and pause when the shoulder blade sets.';
  if (/pulldown|pull-up|pull up|chin/.test(name)) return 'Start from a long arm and pull the elbows down until the chest lifts.';
  if (name.includes('curl')) return 'Pin the upper arm and curl without swinging the torso.';
  if (/pushdown|extension|skull/.test(name)) return 'Lock the upper arm and straighten the elbow. Do not let the shoulder take over.';
  if (/raise|fly/.test(name)) return 'Lead with the elbow and stop at shoulder height. Keep the load light enough to own the path.';
  if (/lunge|split squat/.test(name)) return 'Take a long step, drop the back knee, and keep the front heel down.';
  if (exercise.muscleGroup === 'Legs') return 'Move through a range you can control, and keep the working foot planted.';
  if (exercise.muscleGroup === 'Back') return 'Set the shoulder blade before the arm moves, then return under control.';
  if (exercise.muscleGroup === 'Chest') return 'Keep the shoulders packed and stop short of a lockout that bothers the joint.';
  if (exercise.muscleGroup === 'Shoulders') return 'Raise only as far as the shoulder stays down. Skip the swing.';
  if (exercise.muscleGroup === 'Arms') return 'Hold the upper arm still and finish the elbow. Leave a rep in reserve.';
  return 'Use a load you can move smoothly. Stop the set if the form breaks.';
}

export function substituteExercises(exercise: CatalogExercise, catalog: CatalogExercise[], limit = 4): CatalogExercise[] {
  return catalog
    .filter(
      (item) =>
        item.id !== exercise.id &&
        item.muscleGroup === exercise.muscleGroup &&
        item.equipment !== exercise.equipment,
    )
    .slice(0, limit);
}

export function logTypeLabel(logType: LogType): string {
  if (logType === 'reps') return 'Reps';
  if (logType === 'duration') return 'Duration';
  if (logType === 'reps_duration') return 'Reps and duration';
  return 'Weight and reps';
}

export interface DayMark {
  date: string;
  hasWorkout: boolean;
  hasWeight: boolean;
  hasNotes: boolean;
  hasPhoto: boolean;
  hasMeasurement: boolean;
}

function localIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function buildMonthGrid(year: number, monthIndex: number): { date: string; inMonth: boolean }[] {
  const first = new Date(year, monthIndex, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const cursor = new Date(year, monthIndex, 1 - startOffset);
  const cells: { date: string; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i += 1) {
    cells.push({ date: localIsoDate(cursor), inMonth: cursor.getMonth() === monthIndex });
    cursor.setDate(cursor.getDate() + 1);
  }
  return cells;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.map(csvCell).join(','), ...rows.map((row) => row.map(csvCell).join(','))].join('\n');
}

export function formatClock(seconds: number | null): string {
  if (seconds === null) return '—';
  const mins = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${mins}:${String(rest).padStart(2, '0')}`;
}
