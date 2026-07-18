import { supabase } from './supabase';
import type { RuleResult } from './evaluate';
import type {
  DailyLog,
  DailyLogInsert,
  ExerciseLog,
  ExerciseLogInsert,
  Profile,
  Recommendation,
  RecommendationInsert,
  WeeklySummary,
  WeeklySummaryInsert,
} from './types';

/**
 * Thin typed wrapper around the Supabase client. All row casts live here so the
 * rest of the app works with the types in types.ts.
 */

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Profile | null) ?? null;
}

export async function upsertProfile(profile: Profile): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .upsert(profile, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Profile;
}

export async function getDailyLog(userId: string, logDate: string): Promise<DailyLog | null> {
  const { data, error } = await supabase
    .from('daily_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('log_date', logDate)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DailyLog | null) ?? null;
}

export async function upsertDailyLog(log: DailyLogInsert): Promise<DailyLog> {
  const { data, error } = await supabase
    .from('daily_logs')
    .upsert(log, { onConflict: 'user_id,log_date' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as DailyLog;
}

export async function getLogsBetween(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<DailyLog[]> {
  const { data, error } = await supabase
    .from('daily_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('log_date', startDate)
    .lte('log_date', endDate)
    .order('log_date', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as DailyLog[];
}

/** Most recent weigh-ins (rows carrying weekly_weight_lb), oldest → newest. */
export async function getRecentWeighIns(userId: string, limit: number): Promise<DailyLog[]> {
  const { data, error } = await supabase
    .from('daily_logs')
    .select('*')
    .eq('user_id', userId)
    .not('weekly_weight_lb', 'is', null)
    .order('log_date', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as DailyLog[]).reverse();
}

export async function getExerciseLogs(dailyLogIds: string[]): Promise<ExerciseLog[]> {
  if (dailyLogIds.length === 0) return [];
  const { data, error } = await supabase
    .from('exercise_logs')
    .select('*')
    .in('daily_log_id', dailyLogIds);
  if (error) throw new Error(error.message);
  return (data ?? []) as ExerciseLog[];
}

/** Replace the exercise entries for one training session. */
export async function replaceExerciseLogs(
  dailyLogId: string,
  entries: ExerciseLogInsert[],
): Promise<void> {
  const { error: deleteError } = await supabase
    .from('exercise_logs')
    .delete()
    .eq('daily_log_id', dailyLogId);
  if (deleteError) throw new Error(deleteError.message);
  if (entries.length === 0) return;
  const { error: insertError } = await supabase.from('exercise_logs').insert(entries);
  if (insertError) throw new Error(insertError.message);
}

export async function getRecommendations(
  userId: string,
  logDate: string,
): Promise<Recommendation[]> {
  const { data, error } = await supabase
    .from('recommendations')
    .select('*')
    .eq('user_id', userId)
    .eq('log_date', logDate);
  if (error) throw new Error(error.message);
  return (data ?? []) as Recommendation[];
}

export async function getRecommendationsBetween(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<Recommendation[]> {
  const { data, error } = await supabase
    .from('recommendations')
    .select('*')
    .eq('user_id', userId)
    .gte('log_date', startDate)
    .lte('log_date', endDate)
    .order('log_date', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Recommendation[];
}

export async function dismissRecommendation(id: string): Promise<void> {
  const { error } = await supabase
    .from('recommendations')
    .update({ dismissed: true })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Reconcile the recommendations table with fresh evaluation results:
 * failed rules get a row (once), rules that now pass are marked passed+dismissed.
 * Returns the active (failed, undismissed) recommendations for the date.
 */
export async function syncRecommendations(
  userId: string,
  logDate: string,
  results: RuleResult[],
): Promise<Recommendation[]> {
  const existing = await getRecommendations(userId, logDate);
  const byRuleId = new Map(existing.map((rec) => [rec.rule_id, rec]));

  const inserts: RecommendationInsert[] = [];
  for (const result of results) {
    const current = byRuleId.get(result.rule.id);
    if (result.status === 'fail') {
      if (!current) {
        inserts.push({
          user_id: userId,
          log_date: logDate,
          rule_id: result.rule.id,
          message: result.message,
          severity: result.rule.severity,
          passed: false,
          dismissed: false,
        });
      } else if (current.passed || current.message !== result.message) {
        const { error } = await supabase
          .from('recommendations')
          .update({ passed: false, message: result.message })
          .eq('id', current.id);
        if (error) throw new Error(error.message);
      }
    } else if (result.status === 'pass' && current && !current.passed) {
      const { error } = await supabase
        .from('recommendations')
        .update({ passed: true, dismissed: true, message: result.message })
        .eq('id', current.id);
      if (error) throw new Error(error.message);
    }
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from('recommendations').insert(inserts);
    if (error) throw new Error(error.message);
  }

  const refreshed = await getRecommendations(userId, logDate);
  return refreshed.filter((rec) => !rec.passed && !rec.dismissed);
}

export async function upsertWeeklySummary(summary: WeeklySummaryInsert): Promise<WeeklySummary> {
  const { data, error } = await supabase
    .from('weekly_summaries')
    .upsert(summary, { onConflict: 'user_id,week_start' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as WeeklySummary;
}
