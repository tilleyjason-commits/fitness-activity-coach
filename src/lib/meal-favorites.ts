/**
 * Local-only meal favorites: a one-tap re-log list for meals a user eats
 * repeatedly, so the AI-or-manual path isn't the only way to log food.
 *
 * Stored in localStorage, namespaced per user id (same lesson as
 * workout-offline-queue.ts: a shared device can have more than one account
 * sign in, and one user's favorites must never leak into another's list).
 * There is no server sync — favorites are a device-local convenience, not a
 * source of truth, so there's nothing to reconcile across devices.
 */

import type { MealSlot } from './types';

const STORAGE_KEY_PREFIX = 'fac-meal-favorites-v1';

export interface FavoriteFood {
  food_name: string;
  quantity: number | null;
  unit: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: 'high' | 'medium' | 'low' | null;
}

export interface MealFavorite {
  id: string;
  slot: MealSlot;
  /** Short label shown on the chip — usually the raw description or first food name. */
  label: string;
  mealTime: string | null;
  foods: FavoriteFood[];
  createdAt: string;
}

function keyFor(userId: string): string {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

function readAll(userId: string): MealFavorite[] {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MealFavorite[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(userId: string, favorites: MealFavorite[]): void {
  if (favorites.length === 0) {
    localStorage.removeItem(keyFor(userId));
    return;
  }
  localStorage.setItem(keyFor(userId), JSON.stringify(favorites));
}

export function getFavoritesForSlot(userId: string, slot: MealSlot): MealFavorite[] {
  return readAll(userId).filter((f) => f.slot === slot);
}

const MAX_FAVORITES_PER_SLOT = 12;

export function addFavorite(
  userId: string,
  favorite: Omit<MealFavorite, 'id' | 'createdAt'>,
): MealFavorite {
  const all = readAll(userId);
  const created: MealFavorite = {
    ...favorite,
    id: `${favorite.slot}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  const sameSlot = all.filter((f) => f.slot === favorite.slot);
  const otherSlots = all.filter((f) => f.slot !== favorite.slot);
  // Cap per slot so the quick-add row never grows unbounded; oldest drops first.
  const trimmedSameSlot = [...sameSlot, created].slice(-MAX_FAVORITES_PER_SLOT);
  writeAll(userId, [...otherSlots, ...trimmedSameSlot]);
  return created;
}

export function removeFavorite(userId: string, favoriteId: string): void {
  writeAll(
    userId,
    readAll(userId).filter((f) => f.id !== favoriteId),
  );
}
