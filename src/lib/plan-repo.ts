import { supabase } from './supabase';
import type { PlanDayDraft, PlanFocus, PlanLevel } from './training-surface';

export interface PlanSummary {
  id: string;
  name: string;
  focus: PlanFocus;
  level: PlanLevel;
  description: string;
  weekCount: number;
  currentWeek: number;
  active: boolean;
}

export interface TrainingPlan extends PlanSummary {
  days: PlanDayDraft[];
}

export interface CustomExercise {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string;
  logType: 'weight_reps' | 'reps' | 'duration' | 'reps_duration';
  cue: string;
}

export interface BodyMeasurement {
  id: string;
  measuredOn: string;
  chestIn: number | null;
  armIn: number | null;
  thighIn: number | null;
  hipIn: number | null;
  neckIn: number | null;
  calfIn: number | null;
  notes: string;
}

export interface ProgressPhoto {
  id: string;
  takenOn: string;
  storagePath: string;
  caption: string;
  url: string | null;
}

function asPlan(row: Record<string, unknown>): PlanSummary {
  return {
    id: String(row.id),
    name: String(row.name),
    focus: row.focus as PlanFocus,
    level: row.level as PlanLevel,
    description: String(row.description ?? ''),
    weekCount: Number(row.week_count),
    currentWeek: Number(row.current_week),
    active: Boolean(row.active),
  };
}

export async function listPlans(): Promise<PlanSummary[]> {
  const { data, error } = await supabase
    .from('training_plans')
    .select('id, name, focus, level, description, week_count, current_week, active')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => asPlan(row as Record<string, unknown>));
}

export async function getPlan(planId: string): Promise<TrainingPlan> {
  const { data: plan, error } = await supabase
    .from('training_plans')
    .select('id, name, focus, level, description, week_count, current_week, active')
    .eq('id', planId)
    .single();
  if (error) throw new Error(error.message);
  const { data: days, error: dayError } = await supabase
    .from('plan_days')
    .select('id, week_index, day_index, weekday, name, rest_day, sort_order')
    .eq('plan_id', planId)
    .order('week_index')
    .order('day_index');
  if (dayError) throw new Error(dayError.message);
  const dayIds = (days ?? []).map((day) => day.id as string);
  const { data: exercises, error: exerciseError } = dayIds.length
    ? await supabase
        .from('plan_exercises')
        .select('id, plan_day_id, exercise_id, exercise_name, muscle_group, equipment, log_type, rest_seconds, superset_group, notes, sort_order')
        .in('plan_day_id', dayIds)
        .order('sort_order')
    : { data: [], error: null };
  if (exerciseError) throw new Error(exerciseError.message);
  const exerciseIds = (exercises ?? []).map((exercise) => exercise.id as string);
  const { data: sets, error: setError } = exerciseIds.length
    ? await supabase
        .from('plan_sets')
        .select('plan_exercise_id, set_index, set_type, reps, weight, duration_seconds, rest_seconds')
        .in('plan_exercise_id', exerciseIds)
        .order('set_index')
    : { data: [], error: null };
  if (setError) throw new Error(setError.message);

  return {
    ...asPlan(plan as Record<string, unknown>),
    days: (days ?? []).map((day) => ({
      weekIndex: day.week_index as number,
      dayIndex: day.day_index as number,
      weekday: (day.weekday as string | null) ?? null,
      name: String(day.name ?? ''),
      restDay: Boolean(day.rest_day),
      exercises: (exercises ?? [])
        .filter((exercise) => exercise.plan_day_id === day.id)
        .map((exercise) => ({
          exerciseId: String(exercise.exercise_id),
          name: String(exercise.exercise_name),
          muscleGroup: String(exercise.muscle_group),
          equipment: String(exercise.equipment ?? 'Other'),
          logType: exercise.log_type as CustomExercise['logType'],
          restSeconds: Number(exercise.rest_seconds ?? 90),
          supersetGroup: (exercise.superset_group as number | null) ?? null,
          notes: String(exercise.notes ?? ''),
          sets: (sets ?? [])
            .filter((set) => set.plan_exercise_id === exercise.id)
            .map((set) => ({
              setIndex: Number(set.set_index),
              setType: (set.set_type as 'working' | 'warmup') ?? 'working',
              reps: set.reps as number | null,
              weight: set.weight as number | null,
              durationSeconds: set.duration_seconds as number | null,
              restSeconds: set.rest_seconds as number | null,
            })),
        })),
    })),
  };
}

export async function savePlan(plan: TrainingPlan): Promise<string> {
  const { data, error } = await supabase.rpc('save_training_plan', {
    p_plan: {
      id: plan.id || null,
      name: plan.name,
      focus: plan.focus,
      level: plan.level,
      description: plan.description,
      week_count: plan.weekCount,
      current_week: plan.currentWeek,
      active: plan.active,
      days: plan.days.map((day) => ({
        week_index: day.weekIndex,
        day_index: day.dayIndex,
        weekday: day.weekday,
        name: day.name,
        rest_day: day.restDay,
        sort_order: day.dayIndex,
        exercises: day.exercises.map((exercise, index) => ({
          exercise_id: exercise.exerciseId,
          exercise_name: exercise.name,
          muscle_group: exercise.muscleGroup,
          equipment: exercise.equipment,
          log_type: exercise.logType,
          rest_seconds: exercise.restSeconds,
          superset_group: exercise.supersetGroup,
          notes: exercise.notes,
          sort_order: index,
          sets: exercise.sets.map((set) => ({
            set_index: set.setIndex,
            set_type: set.setType,
            reps: set.reps,
            weight: set.weight,
            duration_seconds: set.durationSeconds,
            rest_seconds: set.restSeconds,
          })),
        })),
      })),
    },
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function setActivePlan(planId: string | null): Promise<void> {
  const { error } = await supabase.rpc('set_active_plan', { p_id: planId });
  if (error) throw new Error(error.message);
}

export async function listCustomExercises(): Promise<CustomExercise[]> {
  const { data, error } = await supabase
    .from('custom_exercises')
    .select('id, name, muscle_group, equipment, log_type, cue')
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    muscleGroup: String(row.muscle_group),
    equipment: String(row.equipment),
    logType: row.log_type as CustomExercise['logType'],
    cue: String(row.cue ?? ''),
  }));
}

export async function saveCustomExercise(
  userId: string,
  exercise: Omit<CustomExercise, 'id'> & { id?: string },
): Promise<void> {
  const { error } = await supabase.from('custom_exercises').upsert({
    ...(exercise.id ? { id: exercise.id } : {}),
    user_id: userId,
    name: exercise.name,
    muscle_group: exercise.muscleGroup,
    equipment: exercise.equipment,
    log_type: exercise.logType,
    cue: exercise.cue,
  });
  if (error) throw new Error(error.message);
}

export async function listMeasurements(): Promise<BodyMeasurement[]> {
  const { data, error } = await supabase
    .from('body_measurements')
    .select('id, measured_on, chest_in, arm_in, thigh_in, hip_in, neck_in, calf_in, notes')
    .order('measured_on', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    measuredOn: String(row.measured_on),
    chestIn: row.chest_in as number | null,
    armIn: row.arm_in as number | null,
    thighIn: row.thigh_in as number | null,
    hipIn: row.hip_in as number | null,
    neckIn: row.neck_in as number | null,
    calfIn: row.calf_in as number | null,
    notes: String(row.notes ?? ''),
  }));
}

export async function saveMeasurement(
  userId: string,
  measurement: Omit<BodyMeasurement, 'id'>,
): Promise<void> {
  const { error } = await supabase.from('body_measurements').upsert(
    {
      user_id: userId,
      measured_on: measurement.measuredOn,
      chest_in: measurement.chestIn,
      arm_in: measurement.armIn,
      thigh_in: measurement.thighIn,
      hip_in: measurement.hipIn,
      neck_in: measurement.neckIn,
      calf_in: measurement.calfIn,
      notes: measurement.notes,
    },
    { onConflict: 'user_id,measured_on' },
  );
  if (error) throw new Error(error.message);
}

export async function listPhotos(): Promise<ProgressPhoto[]> {
  const { data, error } = await supabase
    .from('progress_photos')
    .select('id, taken_on, storage_path, caption')
    .order('taken_on', { ascending: false });
  if (error) throw new Error(error.message);
  const photos = data ?? [];
  const signed = await Promise.all(
    photos.map(async (photo) => {
      const { data: urlData } = await supabase.storage
        .from('progress-photos')
        .createSignedUrl(String(photo.storage_path), 60 * 60);
      return {
        id: String(photo.id),
        takenOn: String(photo.taken_on),
        storagePath: String(photo.storage_path),
        caption: String(photo.caption ?? ''),
        url: urlData?.signedUrl ?? null,
      };
    }),
  );
  return signed;
}

export async function uploadProgressPhoto(
  userId: string,
  file: File,
  takenOn: string,
  caption: string,
): Promise<void> {
  const path = `${userId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.]+/g, '-')}`;
  const { error: uploadError } = await supabase.storage.from('progress-photos').upload(path, file, {
    contentType: file.type || 'image/jpeg',
    upsert: false,
  });
  if (uploadError) throw new Error(uploadError.message);
  const { error } = await supabase.from('progress_photos').insert({
    user_id: userId,
    taken_on: takenOn,
    storage_path: path,
    caption,
  });
  if (error) throw new Error(error.message);
}

export async function recordOverloadDecision(input: {
  userId: string;
  exerciseId: string;
  workoutDate: string;
  decision: 'accept' | 'skip';
  suggestedReps: number | null;
  suggestedWeight: number | null;
}): Promise<void> {
  const { error } = await supabase.from('overload_decisions').upsert(
    {
      user_id: input.userId,
      exercise_id: input.exerciseId,
      workout_date: input.workoutDate,
      decision: input.decision,
      suggested_reps: input.suggestedReps,
      suggested_weight: input.suggestedWeight,
    },
    { onConflict: 'user_id,exercise_id,workout_date' },
  );
  if (error) throw new Error(error.message);
}

export async function deleteOwnAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_own_account');
  if (error) throw new Error(error.message);
}
