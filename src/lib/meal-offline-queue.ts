/**
 * Offline-first queue for meal saves (save_meal RPC). Mirrors
 * workout-offline-queue.ts / daily-log-offline-queue.ts: namespaced per
 * user id, mismatched entries quarantined instead of replayed, quarantined
 * (not deleted) on sign-out.
 *
 * Meals are keyed by (date, slot) — a later offline edit to the same slot
 * replaces the earlier queued one, matching what save_meal itself does
 * online (each slot holds exactly one meal_logs row).
 */

import type { MealSlot } from './types';

const QUEUE_KEY_PREFIX = 'fac-meal-offline-queue-v1';
const QUARANTINE_KEY = 'fac-meal-offline-queue-quarantine-v1';

/** Matches MealSaveInput['foods'][number] structurally — kept local so this
 * module has no dependency on the meal-favorites/favorites-UI feature. */
export interface QueuedMealFood {
  food_name: string;
  quantity: number | null;
  unit: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: 'high' | 'medium' | 'low' | null;
}

export interface QueuedMealInput {
  rawInput: string;
  mealTime: string | null;
  foods: QueuedMealFood[];
}

export interface QueuedMealSave {
  id: string;
  userId: string;
  date: string;
  slot: MealSlot;
  input: QueuedMealInput;
  enqueuedAt: string;
  lastError?: string;
  attempts: number;
}

function queueKeyFor(userId: string): string {
  return `${QUEUE_KEY_PREFIX}:${userId}`;
}

function readRaw(key: string): QueuedMealSave[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedMealSave[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRaw(key: string, items: QueuedMealSave[]): void {
  if (items.length === 0) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, JSON.stringify(items));
}

function quarantine(items: QueuedMealSave[]): void {
  if (items.length === 0) return;
  writeRaw(QUARANTINE_KEY, [...readRaw(QUARANTINE_KEY), ...items]);
}

function readQueue(userId: string): QueuedMealSave[] {
  return readRaw(queueKeyFor(userId));
}

function writeQueue(userId: string, items: QueuedMealSave[]): void {
  writeRaw(queueKeyFor(userId), items);
}

export function getPendingMealSaves(userId: string): QueuedMealSave[] {
  return readQueue(userId);
}

export function hasPendingMealSaves(userId: string): boolean {
  return readQueue(userId).length > 0;
}

export function enqueueMealSave(
  userId: string,
  date: string,
  slot: MealSlot,
  input: QueuedMealInput,
  errorMessage?: string,
): void {
  const queue = readQueue(userId).filter((item) => !(item.date === date && item.slot === slot));
  queue.push({
    id: `${date}-${slot}-${Date.now()}`,
    userId,
    date,
    slot,
    input,
    enqueuedAt: new Date().toISOString(),
    lastError: errorMessage,
    attempts: 0,
  });
  writeQueue(userId, queue);
}

export function quarantineMealSaveQueue(userId: string): void {
  const queue = readQueue(userId);
  if (queue.length === 0) return;
  quarantine(queue);
  writeQueue(userId, []);
}

export function clearMealSaveQueue(userId: string): void {
  writeQueue(userId, []);
}

/**
 * Attempt every pending save. `ensureDailyLogId` resolves (creating if
 * necessary) the daily_logs row id for a queued item's date — the queue may
 * outlive the page/date the user was on when it went offline. Items whose
 * stored userId doesn't match the caller are quarantined instead of replayed.
 */
export async function flushMealSaveQueue(
  userId: string,
  ensureDailyLogId: (date: string) => Promise<string>,
  save: (dailyLogId: string, slot: MealSlot, input: QueuedMealInput) => Promise<void>,
): Promise<{ flushed: number; remaining: number; lastError: string | null }> {
  const queue = readQueue(userId);
  if (queue.length === 0) return { flushed: 0, remaining: 0, lastError: null };

  const mismatched = queue.filter((item) => item.userId !== userId);
  if (mismatched.length > 0) quarantine(mismatched);

  const owned = queue.filter((item) => item.userId === userId);
  const remaining: QueuedMealSave[] = [];
  let flushed = 0;
  let lastError: string | null = null;

  for (const item of owned) {
    try {
      const dailyLogId = await ensureDailyLogId(item.date);
      await save(dailyLogId, item.slot, item.input);
      flushed += 1;
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Offline sync failed';
      remaining.push({ ...item, attempts: item.attempts + 1, lastError });
    }
  }

  writeQueue(userId, remaining);
  return { flushed, remaining: remaining.length, lastError };
}

/**
 * Try a live save first; on failure, queue for later replay and rethrow so
 * the caller can surface the error (matches saveWorkoutWithOfflineQueue).
 */
export async function saveMealWithOfflineQueue(
  userId: string,
  date: string,
  slot: MealSlot,
  input: QueuedMealInput,
  ensureDailyLogId: (date: string) => Promise<string>,
  save: (dailyLogId: string, slot: MealSlot, input: QueuedMealInput) => Promise<void>,
): Promise<void> {
  try {
    const dailyLogId = await ensureDailyLogId(date);
    await save(dailyLogId, slot, input);
    if (hasPendingMealSaves(userId)) {
      void flushMealSaveQueue(userId, ensureDailyLogId, save);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Meal save failed';
    enqueueMealSave(userId, date, slot, input, message);
    throw error;
  }
}
