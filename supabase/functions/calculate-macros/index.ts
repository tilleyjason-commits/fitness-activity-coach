// Supabase Edge Function (Deno) — calculate-macros
//
// POST { description: string, meal_slot: MealSlot }
// → { foods: AIFood[], meal_total: { calories, protein_g, carbs_g, fat_g } }
//
// Parses a natural-language meal description into per-food macro estimates via
// NVIDIA GLM-5.2. Stateless: never touches the database. The NVIDIA key comes
// from the function environment (supabase secrets set NVIDIA_API_KEY=...).

const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_MODEL = 'z-ai/glm-5.2';

const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'post_gym', 'snack'] as const;
type MealSlot = (typeof MEAL_SLOTS)[number];

interface AIFood {
  food_name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: 'high' | 'medium' | 'low';
}

const SYSTEM_PROMPT =
  "You are a nutrition analysis AI. Parse meal descriptions into individual food items with macro estimates. " +
  "Use standard USDA nutrition data as your reference. Return ONLY valid JSON with no markdown or commentary. " +
  "For each food, provide the most accurate macronutrient breakdown you can based on standard serving sizes. " +
  "Set confidence to 'high' when the food is a well-known branded item with reliable data, 'medium' for common " +
  "whole foods with standard nutrition, and 'low' for unusual items or quantities you're uncertain about. " +
  'Respond with a JSON object of the shape: {"foods": [{"food_name": string, "quantity": number, "unit": string, ' +
  '"calories": number, "protein_g": number, "carbs_g": number, "fat_g": number, "confidence": "high"|"medium"|"low"}], ' +
  '"meal_total": {"calories": number, "protein_g": number, "carbs_g": number, "fat_g": number}}';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function asNumber(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

function asConfidence(value: unknown): AIFood['confidence'] {
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'low';
}

/** GLM sometimes wraps JSON in markdown fences; extract the outermost object. */
function extractJson(content: string): string {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in model output');
  }
  return content.slice(start, end + 1);
}

function normalizeFoods(raw: unknown): AIFood[] {
  if (!Array.isArray(raw)) throw new Error('Model output missing "foods" array');
  return raw.map((item) => {
    const food = (item ?? {}) as Record<string, unknown>;
    return {
      food_name: String(food.food_name ?? 'Unknown food'),
      quantity: asNumber(food.quantity ?? 1) || 1,
      unit: String(food.unit ?? 'serving'),
      calories: Math.round(asNumber(food.calories)),
      protein_g: Math.round(asNumber(food.protein_g) * 10) / 10,
      carbs_g: Math.round(asNumber(food.carbs_g) * 10) / 10,
      fat_g: Math.round(asNumber(food.fat_g) * 10) / 10,
      confidence: asConfidence(food.confidence),
    };
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const apiKey = Deno.env.get('NVIDIA_API_KEY');
  if (!apiKey) {
    return jsonResponse({ error: 'NVIDIA_API_KEY is not configured' }, 500);
  }

  let description: string;
  let mealSlot: MealSlot;
  try {
    const body = (await req.json()) as { description?: unknown; meal_slot?: unknown };
    description = String(body.description ?? '').trim();
    mealSlot = body.meal_slot as MealSlot;
    if (!description) throw new Error('description is required');
    if (!MEAL_SLOTS.includes(mealSlot)) throw new Error('meal_slot is invalid');
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Invalid request body';
    return jsonResponse({ error: message }, 400);
  }

  const nvidiaRes = await fetch(NVIDIA_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: NVIDIA_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Meal slot: ${mealSlot}\nMeal description: ${description}` },
      ],
      temperature: 0.2,
      max_tokens: 1024,
    }),
  });

  if (!nvidiaRes.ok) {
    const detail = await nvidiaRes.text();
    console.error(`NVIDIA API error ${nvidiaRes.status}: ${detail}`);
    return jsonResponse({ error: `NVIDIA API request failed (${nvidiaRes.status})` }, 502);
  }

  try {
    const completion = (await nvidiaRes.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = completion.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty completion from model');

    const parsed = JSON.parse(extractJson(content)) as { foods?: unknown };
    const foods = normalizeFoods(parsed.foods);

    // Recompute totals server-side so they always match the food rows.
    const meal_total = foods.reduce(
      (acc, food) => ({
        calories: acc.calories + food.calories,
        protein_g: Math.round((acc.protein_g + food.protein_g) * 10) / 10,
        carbs_g: Math.round((acc.carbs_g + food.carbs_g) * 10) / 10,
        fat_g: Math.round((acc.fat_g + food.fat_g) * 10) / 10,
      }),
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
    );

    return jsonResponse({ foods, meal_total });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to parse model output';
    console.error('calculate-macros parse failure:', message);
    return jsonResponse({ error: `Could not parse macros: ${message}` }, 502);
  }
});
