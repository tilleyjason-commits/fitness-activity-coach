// Supabase Edge Function (Deno) — calculate-macros
//
// POST { description: string, meal_slot: MealSlot }  (Authorization: user JWT required)
// → { foods: AIFood[], meal_total: { calories, protein_g, carbs_g, fat_g } }
//
// All request handling lives in handler.ts (unit-tested with Vitest). This
// file only wires real dependencies:
//   * verifyUser      — validates the caller's JWT against Supabase Auth
//   * consumeRateLimit— atomic per-user quota via the consume_macro_calc_quota
//                       RPC (migration 010); DB-enforced, multi-instance safe
//   * callProvider    — NVIDIA GLM-5.2 chat completion (key from function env)
//
// Deploy order: apply migration 010 BEFORE deploying this function (see
// docs/DEPLOYMENT.md). There is deliberately no fallback provider.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { createMacroHandler, type MealSlot, type RateLimitDecision } from './handler.ts';

const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_MODEL = 'z-ai/glm-5.2';

const SYSTEM_PROMPT =
  "You are a nutrition analysis AI. Parse meal descriptions into individual food items with macro estimates. " +
  "Use standard USDA nutrition data as your reference. Return ONLY valid JSON with no markdown or commentary. " +
  "For each food, provide the most accurate macronutrient breakdown you can based on standard serving sizes. " +
  "Set confidence to 'high' when the food is a well-known branded item with reliable data, 'medium' for common " +
  "whole foods with standard nutrition, and 'low' for unusual items or quantities you're uncertain about. " +
  'Respond with a JSON object of the shape: {"foods": [{"food_name": string, "quantity": number, "unit": string, ' +
  '"calories": number, "protein_g": number, "carbs_g": number, "fat_g": number, "confidence": "high"|"medium"|"low"}], ' +
  '"meal_total": {"calories": number, "protein_g": number, "carbs_g": number, "fat_g": number}}';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

/** A client scoped to the caller's JWT: auth.getUser() verifies the token and
 *  rpc() executes with auth.uid() = the verified user (RLS-safe). */
function userScopedClient(authHeader: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function verifyUser(authHeader: string): Promise<string | null> {
  const client = userScopedClient(authHeader);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

async function consumeRateLimit(_userId: string, authHeader: string): Promise<RateLimitDecision> {
  // The RPC derives the user from auth.uid() (the JWT on this client) — the
  // userId argument is informational only and never sent to the database.
  const client = userScopedClient(authHeader);
  const { data, error } = await client.rpc('consume_macro_calc_quota');
  if (error) {
    // Fail closed: if the quota RPC is unavailable we do not spend provider
    // budget on unmetered calls.
    throw new Error(`quota RPC failed: ${error.code ?? 'unknown'}`);
  }
  return data as RateLimitDecision;
}

function callProvider(description: string, mealSlot: MealSlot): Promise<Response> {
  const apiKey = Deno.env.get('NVIDIA_API_KEY');
  if (!apiKey) {
    return Promise.resolve(new Response('provider key not configured', { status: 500 }));
  }
  return fetch(NVIDIA_API_URL, {
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
}

const handler = createMacroHandler({
  verifyUser,
  consumeRateLimit,
  callProvider,
  log: (...parts: string[]) => console.error(...parts),
});

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    return await handler(req);
  } catch {
    // handler already catches; this is a belt-and-braces guard.
    return new Response(JSON.stringify({ error: { code: 'internal', message: 'Unexpected error.' } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
