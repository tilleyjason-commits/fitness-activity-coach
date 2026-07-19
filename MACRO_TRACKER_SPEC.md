# Macro Tracker Enhancement — Build Spec

## Overview
Add AI-powered per-meal macro tracking to the Fitness Activity Coach iOS app. Five fixed meal slots — Breakfast, Lunch, Dinner, Post-Gym Meal, Snack — each accept a natural-language description (e.g., "two eggs and a Premier Protein Shake") that gets sent to an Edge Function running NVIDIA GLM-5.2 to calculate macros. Results are editable, savable, and auto-summed into the daily_logs totals for the evaluation engine.

## Supabase Schema

### Table: meal_logs
```sql
CREATE TABLE meal_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_log_id UUID NOT NULL REFERENCES daily_logs(id) ON DELETE CASCADE,
  meal_slot TEXT NOT NULL CHECK (meal_slot IN ('breakfast','lunch','dinner','post_gym','snack')),
  meal_time TIME,
  raw_input TEXT,                  -- user's natural language description
  total_calories INT DEFAULT 0,
  total_protein_g DECIMAL DEFAULT 0,
  total_carbs_g DECIMAL DEFAULT 0,
  total_fat_g DECIMAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(daily_log_id, meal_slot)
);
ALTER TABLE meal_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own meal logs" ON meal_logs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM daily_logs WHERE daily_logs.id = meal_logs.daily_log_id AND daily_logs.user_id = auth.uid())
  );
```

### Table: meal_foods
```sql
CREATE TABLE meal_foods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_log_id UUID NOT NULL REFERENCES meal_logs(id) ON DELETE CASCADE,
  food_name TEXT NOT NULL,
  quantity DECIMAL,
  unit TEXT,
  calories INT NOT NULL,
  protein_g DECIMAL NOT NULL,
  carbs_g DECIMAL NOT NULL,
  fat_g DECIMAL NOT NULL,
  confidence TEXT CHECK (confidence IN ('high','medium','low')),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE meal_foods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own meal foods" ON meal_foods
  FOR ALL USING (
    EXISTS (SELECT 1 FROM meal_logs JOIN daily_logs ON daily_logs.id = meal_logs.daily_log_id
      WHERE meal_logs.id = meal_foods.meal_log_id AND daily_logs.user_id = auth.uid())
  );
```

## Edge Function: calculate-macros

Location: `supabase/functions/calculate-macros/index.ts` (Deno)

POST /calculate-macros
Body: `{ "description": "two eggs and a Premier Protein Shake", "meal_slot": "breakfast" }`

Calls NVIDIA GLM-5.2 chat completions endpoint:
- Model: `glm-5.2` via NVIDIA NIM API base: `https://api.nvcf.nvidia.com/v1/chat/completions`
- Auth: Bearer token from environment variable `NVIDIA_API_KEY`
- System prompt instructs the model to parse food items and return ONLY a JSON array
- Response format:
```json
{
  "foods": [
    {
      "food_name": "large egg",
      "quantity": 2,
      "unit": "whole",
      "calories": 140,
      "protein_g": 12,
      "carbs_g": 1,
      "fat_g": 10,
      "confidence": "high"
    },
    {
      "food_name": "Premier Protein Shake",
      "quantity": 1,
      "unit": "bottle (11 fl oz)",
      "calories": 160,
      "protein_g": 30,
      "carbs_g": 5,
      "fat_g": 3,
      "confidence": "high"
    }
  ],
  "meal_total": {
    "calories": 300,
    "protein_g": 42,
    "carbs_g": 6,
    "fat_g": 13
  }
}
```

Edge Function system prompt:
"You are a nutrition analysis AI. Parse meal descriptions into individual food items with macro estimates. Use standard USDA nutrition data as your reference. Return ONLY valid JSON with no markdown or commentary. For each food, provide the most accurate macronutrient breakdown you can based on standard serving sizes. Set confidence to 'high' when the food is a well-known branded item with reliable data, 'medium' for common whole foods with standard nutrition, and 'low' for unusual items or quantities you're uncertain about."

## UI Components

### MacroTrackerPage.tsx (new page, add to router)
Full-page view showing all 5 meal slots for the selected date.

Layout:
```
┌─────────────────────────────────┐
│  Today's Meals         [Date]   │
├─────────────────────────────────┤
│  🔵 Breakfast (7:15 AM)         │
│  ┌─ "two eggs and a Premier..." │
│  │ [Calculate] [Save] [Clear]  │
│  │ 2 eggs       ─ 140 cal      │
│  │ 1 shake      ─ 160 cal      │
│  │                     Total:300│
│  └──────────────────────────────│
│  🟢 Lunch                      │
│  ┌─ "..."                      │
│  └──────────────────────────────│
│  🟠 Dinner                     │
│  ├─ ...                        │
│  ├─ ...                        │
│  │    Day Total: P:___ C:___ F:___ │
└─────────────────────────────────┘
```

Each meal card:
1. Meal slot header with icon + time picker
2. Textarea for natural-language input (placeholder: "Describe what you ate...")
3. **[Calculate with AI]** button — calls Edge Function, shows loading spinner, populates results
4. Results table — one row per food item with editable fields (calories, protein, carbs, fat, quantity)
5. **[Save]** — upserts meal_logs + meal_foods, auto-sums to daily_logs
6. **[Clear]** — deletes meal_logs row and cascade-deletes foods, re-runs auto-sum

### MealCard.tsx (new component)
Reusable card for a single meal slot. Props: mealSlot, existingMealLog, onSave, onClear, onCalculate.

State machine:
- `idle` — show textarea + placeholder
- `calculating` — show spinner, textarea disabled
- `results` — show parsed foods table, editable
- `saved` — meal saved, show summary + edit button
- `error` — show error message + retry button

### DayMacroSummary.tsx (new component)
Bottom bar on MacroTrackerPage showing summed daily totals:
```
┌─ Daily Total ─────────────────────┐
│ Calories  Protein   Carbs   Fat   │
│  2,100    195g     220g     65g   │
│ ████████████████░░░ 78% of target │
└───────────────────────────────────┘
```
Color-coded: green = on track, yellow = close, red = over/under.

## Integration with Existing App

### Auto-sum into daily_logs
When meals are saved/cleared, a function `syncDailyTotals(dailyLogId)` fires:
1. SELECT SUM(total_calories), SUM(total_protein_g), SUM(total_carbs_g), SUM(total_fat_g) FROM meal_logs WHERE daily_log_id = ?
2. UPDATE daily_logs SET daily_calories = ?, daily_protein_g = ?, daily_carbs_g = ?, daily_fat_g = ? WHERE id = ?
3. This feeds directly into the existing evaluate engine which checks these fields against targets

### Navigation
- Add "Macros" tab to the bottom NavBar (between "Log" and "Weekly")
- Replace the existing nutrition sliders in LogNutrition page with a link: "→ Log your meals with AI macro tracking"

### Evaluate Engine Integration
- Add new rules to rules.json:
  - `meal_breakfast_complete` — at least one food logged for breakfast if training day
  - `meal_post_gym_complete` — post-gym meal logged within 2 hours of training
  - `meal_snack_timing` — 3pm snack logged on training days
- Existing macro rules now auto-measure against AI-calculated totals

## TypeScript Types (add to src/lib/types.ts)

```typescript
export interface MealLog {
  id: string;
  daily_log_id: string;
  meal_slot: 'breakfast' | 'lunch' | 'dinner' | 'post_gym' | 'snack';
  meal_time: string | null;
  raw_input: string | null;
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  created_at: string;
}

export interface MealFood {
  id: string;
  meal_log_id: string;
  food_name: string;
  quantity: number | null;
  unit: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: 'high' | 'medium' | 'low' | null;
  created_at: string;
}

export interface MacrosFromAI {
  foods: Array<{
    food_name: string;
    quantity: number;
    unit: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    confidence: 'high' | 'medium' | 'low';
  }>;
  meal_total: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
}

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'post_gym' | 'snack';
```

## Constants (add to src/lib/constants.ts)

```typescript
export const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'post_gym', 'snack'];

export const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  post_gym: 'Post-Gym Meal',
  snack: 'Snack',
};

export const MEAL_SLOT_ICONS: Record<MealSlot, string> = {
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
  post_gym: '💪',
  snack: '🍎',
};

export const MEAL_SLOT_TIMES: Record<MealSlot, { start: string; hint: string }> = {
  breakfast: { start: '07:00', hint: 'Pre-workout / morning meal' },
  lunch: { start: '12:00', hint: 'Mid-day meal' },
  dinner: { start: '18:00', hint: 'Evening meal' },
  post_gym: { start: '12:00', hint: 'After training (~12:00)' },
  snack: { start: '15:00', hint: '3pm snack' },
};
```

## Environment & Secrets
- Edge Function reads NVIDIA_API_KEY from the function env (set via Supabase Secrets)
- The frontend never touches the NVIDIA key — it calls the Edge Function endpoint only

## App Routes
- `/macros` → MacroTrackerPage (new)
- Add to NavBar with icon, before "Weekly"

## Files to Create/Modify

**New files:**
1. `supabase/functions/calculate-macros/index.ts` — Edge Function
2. `src/pages/MacroTrackerPage.tsx` — Main macro page
3. `src/components/MealCard.tsx` — Single meal card component
4. `src/components/DayMacroSummary.tsx` — Daily totals summary bar

**Modified files:**
5. `src/lib/types.ts` — Add MealLog, MealFood, MacrosFromAI, MealSlot types
6. `src/lib/constants.ts` — Add meal slot constants
7. `src/lib/db.ts` — Add meal CRUD functions and syncDailyTotals
8. `src/components/NavBar.tsx` — Add "Macros" tab
9. `src/App.tsx` — Add /macros route
10. `src/pages/LogNutrition.tsx` — Add link to macro tracker
11. `rules/rules.json` — Add meal-related rules
