import { supabase } from './supabase';
import { describeFunctionsInvokeError } from './macro-errors';
import type { RuleResult } from './evaluate';
import type {
  DailyLog,
  DailyLogInsert,
  ExerciseLog,
  ExerciseLogInsert,
  MacrosFromAI,
  MealFood,
  MealFoodInsert,
  MealLog,
  MealSlot,
  Profile,
  Recommendation,
  RecommendationInsert,
  SupplementLogRow,
  UserSupplement,
  UserSupplementInsert,
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

/**
 * Returns true when the profile has at least been started (has a row).
 * The wizard checks this to decide whether to redirect.
 */
export async function hasProfile(userId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('id', userId);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

export async function upsertProfile(profile: Profile): Promise<Profile> {
  // Ownership contract: id and user_id are both auth.uid(). Normalize here so
  // every caller sends a schema-valid payload (profiles.user_id is NOT NULL).
  const payload: Profile = { ...profile, user_id: profile.user_id || profile.id };
  const { data, error } = await supabase
    .from('profiles')
    .upsert(payload, { onConflict: 'id' })
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

/**
 * Replace the exercise entries for one training session through the
 * transactional replace_exercise_logs RPC (migration 011). Ownership is
 * verified server-side against auth.uid(); no destructive client fallback.
 */
export async function replaceExerciseLogs(
  dailyLogId: string,
  entries: ExerciseLogInsert[],
): Promise<void> {
  const { error } = await supabase.rpc('replace_exercise_logs', {
    p_daily_log_id: dailyLogId,
    p_entries: entries.map(({ daily_log_id: _dailyLogId, ...entry }) => entry),
  });
  if (error) throw new Error(`Training entries save failed (replace_exercise_logs): ${error.message}`);
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
        // A row the system auto-dismissed (on pass or on supplement
        // deactivation) carries passed=true; when its rule fails again it must
        // resurface, so clear dismissed too. Manual dismissals of live
        // failures (passed=false, dismissed=true) are left untouched.
        const patch: Partial<Recommendation> = { passed: false, message: result.message };
        if (current.passed) patch.dismissed = false;
        const { error } = await supabase
          .from('recommendations')
          .update(patch)
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

/**
 * Hide recommendations whose rules no longer apply (their built-in supplement
 * was deactivated/removed). Rows are marked passed+dismissed — the same state
 * a passing rule reaches — so syncRecommendations can resurface them if the
 * supplement is reactivated and its rule fails again.
 */
export async function reconcileInapplicableRecommendations(
  userId: string,
  logDate: string,
  ruleIds: string[],
): Promise<void> {
  if (ruleIds.length === 0) return;
  const { error } = await supabase
    .from('recommendations')
    .update({ passed: true, dismissed: true })
    .eq('user_id', userId)
    .eq('log_date', logDate)
    .in('rule_id', ruleIds)
    .eq('passed', false);
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ */
/* Meal logs (AI macro tracker)                                        */
/* ------------------------------------------------------------------ */

export async function getMealLogs(dailyLogId: string): Promise<MealLog[]> {
  const { data, error } = await supabase
    .from('meal_logs')
    .select('*')
    .eq('daily_log_id', dailyLogId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as MealLog[];
}

export async function getMealFoods(mealLogIds: string[]): Promise<MealFood[]> {
  if (mealLogIds.length === 0) return [];
  const { data, error } = await supabase
    .from('meal_foods')
    .select('*')
    .in('meal_log_id', mealLogIds)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as MealFood[];
}

/** One meal slot's worth of user input, saved as a single aggregate. */
export interface MealSaveData {
  rawInput: string;
  mealTime: string | null;
  foods: Omit<MealFoodInsert, 'meal_log_id'>[];
}

/**
 * Save one meal slot (log row + food rows + daily macro totals) through the
 * transactional save_meal RPC (migration 011): one atomic round trip, totals
 * computed server-side, ownership verified against auth.uid(). No destructive
 * client fallback — failures surface as retryable errors.
 */
export async function saveMeal(
  dailyLogId: string,
  mealSlot: MealSlot,
  input: MealSaveData,
): Promise<void> {
  const { error } = await supabase.rpc('save_meal', {
    p_daily_log_id: dailyLogId,
    p_meal_slot: mealSlot,
    p_meal_time: input.mealTime,
    p_raw_input: input.rawInput || null,
    p_foods: input.foods,
  });
  if (error) throw new Error(`Meal save failed (save_meal): ${error.message}`);
}

/** Delete one meal slot and resync daily totals atomically (delete_meal RPC). */
export async function deleteMeal(dailyLogId: string, mealSlot: MealSlot): Promise<void> {
  const { error } = await supabase.rpc('delete_meal', {
    p_daily_log_id: dailyLogId,
    p_meal_slot: mealSlot,
  });
  if (error) throw new Error(`Meal delete failed (delete_meal): ${error.message}`);
}

/** Ask the calculate-macros Edge Function (NVIDIA GLM-5.2) to parse a meal description. */
export async function calculateMacros(
  description: string,
  mealSlot: MealSlot,
): Promise<MacrosFromAI> {
  const { data, error } = await supabase.functions.invoke<MacrosFromAI>('calculate-macros', {
    body: { description, meal_slot: mealSlot },
  });
  if (error) throw new Error(await describeFunctionsInvokeError(error));
  if (!data || !Array.isArray(data.foods)) {
    throw new Error('Macro calculator returned an unexpected response.');
  }
  return data;
}

/* ------------------------------------------------------------------ */
/* User supplements (migration 013)                                    */
/* ------------------------------------------------------------------ */

export async function listSupplements(userId: string): Promise<UserSupplement[]> {
  const { data, error } = await supabase
    .from('user_supplements')
    .select('*')
    .eq('user_id', userId)
    .order('active', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as UserSupplement[];
}

/**
 * Insert one supplement. Built-in quick-add passes the canonical slug; custom
 * rows omit slug so the database generates one. No defaults are ever seeded —
 * every row is an explicit user choice.
 */
export async function addSupplement(input: UserSupplementInsert): Promise<UserSupplement> {
  const { data, error } = await supabase
    .from('user_supplements')
    .insert(input)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as UserSupplement;
}

export async function updateSupplement(
  id: string,
  patch: Partial<
    Pick<
      UserSupplement,
      'name' | 'dose_amount' | 'dose_unit' | 'instructions' | 'active' | 'sort_order'
    >
  >,
): Promise<UserSupplement> {
  const { data, error } = await supabase
    .from('user_supplements')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as UserSupplement;
}

/** Hard delete; supplement_logs cascade. Legacy daily_logs history is untouched. */
export async function deleteSupplement(id: string): Promise<void> {
  const { error } = await supabase.from('user_supplements').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function getSupplementLogs(
  userId: string,
  logDate: string,
): Promise<SupplementLogRow[]> {
  const { data, error } = await supabase
    .from('supplement_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('log_date', logDate);
  if (error) throw new Error(error.message);
  return (data ?? []) as SupplementLogRow[];
}

/**
 * The ONLY write path for taken/untaken: the set_supplement_taken RPC
 * (migration 013) writes the presence row and syncs the matching legacy
 * daily_logs boolean server-side in one transaction. No client-side dual
 * write or fallback — failures surface as retryable errors.
 */
export async function setSupplementTaken(
  supplementId: string,
  logDate: string,
  taken: boolean,
): Promise<void> {
  const { error } = await supabase.rpc('set_supplement_taken', {
    p_supplement_id: supplementId,
    p_log_date: logDate,
    p_taken: taken,
  });
  if (error) throw new Error(`Supplement save failed (set_supplement_taken): ${error.message}`);
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
