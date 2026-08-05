import { beforeEach, describe, expect, it } from 'vitest';
import { addFavorite, getFavoritesForSlot, removeFavorite } from '~/lib/meal-favorites';
import type { FavoriteFood } from '~/lib/meal-favorites';

const USER_A = 'user-a';
const USER_B = 'user-b';

const sampleFoods: FavoriteFood[] = [
  {
    food_name: 'Chicken breast',
    quantity: 6,
    unit: 'oz',
    calories: 280,
    protein_g: 52,
    carbs_g: 0,
    fat_g: 6,
    confidence: 'high',
  },
];

beforeEach(() => {
  localStorage.clear();
});

describe('meal favorites', () => {
  it('adds and lists a favorite for its slot', () => {
    addFavorite(USER_A, { slot: 'lunch', label: 'Chicken and rice', mealTime: '12:00', foods: sampleFoods });
    const favorites = getFavoritesForSlot(USER_A, 'lunch');
    expect(favorites).toHaveLength(1);
    expect(favorites[0].label).toBe('Chicken and rice');
    expect(favorites[0].foods).toEqual(sampleFoods);
  });

  it('keeps favorites isolated per slot', () => {
    addFavorite(USER_A, { slot: 'lunch', label: 'Lunch meal', mealTime: null, foods: sampleFoods });
    addFavorite(USER_A, { slot: 'dinner', label: 'Dinner meal', mealTime: null, foods: sampleFoods });
    expect(getFavoritesForSlot(USER_A, 'lunch')).toHaveLength(1);
    expect(getFavoritesForSlot(USER_A, 'dinner')).toHaveLength(1);
    expect(getFavoritesForSlot(USER_A, 'lunch')[0].label).toBe('Lunch meal');
  });

  it('removes a favorite by id without touching others', () => {
    const first = addFavorite(USER_A, { slot: 'lunch', label: 'First', mealTime: null, foods: sampleFoods });
    addFavorite(USER_A, { slot: 'lunch', label: 'Second', mealTime: null, foods: sampleFoods });
    removeFavorite(USER_A, first.id);
    const remaining = getFavoritesForSlot(USER_A, 'lunch');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].label).toBe('Second');
  });

  it('keeps favorites isolated per user on a shared device', () => {
    addFavorite(USER_A, { slot: 'lunch', label: "A's meal", mealTime: null, foods: sampleFoods });
    addFavorite(USER_B, { slot: 'lunch', label: "B's meal", mealTime: null, foods: sampleFoods });
    expect(getFavoritesForSlot(USER_A, 'lunch').map((f) => f.label)).toEqual(["A's meal"]);
    expect(getFavoritesForSlot(USER_B, 'lunch').map((f) => f.label)).toEqual(["B's meal"]);
  });

  it('caps favorites per slot, dropping the oldest first', () => {
    for (let i = 0; i < 15; i++) {
      addFavorite(USER_A, { slot: 'lunch', label: `Meal ${i}`, mealTime: null, foods: sampleFoods });
    }
    const favorites = getFavoritesForSlot(USER_A, 'lunch');
    expect(favorites).toHaveLength(12);
    expect(favorites[0].label).toBe('Meal 3');
    expect(favorites[favorites.length - 1].label).toBe('Meal 14');
  });
});
