// Supabase Edge Function (Deno) — calculate-macros
//
// POST { description: string, meal_slot: MealSlot }  (Authorization: user JWT required)
// → { foods, meal_total, provider, model, fallback?, fallback_reason? }
//
// Provider policy:
//   1. OpenRouter GPT-4o-mini (primary) — cheapest model with strong Western
//      food nutrition knowledge and native structured JSON output.
//   2. NVIDIA GLM-5.2 (fallback) — available when OpenRouter is degraded.
//   Fallback is ALWAYS announced via fallback:true + model/provider fields.
//
// Required secrets: OPENROUTER_API_KEY, NVIDIA_API_KEY
// (SUPABASE_URL / SUPABASE_ANON_KEY injected automatically)

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  createMacroHandler,
  type MealSlot,
  type ProviderAttempt,
  type RateLimitDecision,
} from './handler.ts';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = 'openai/gpt-4o-mini';
const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_MODEL = 'z-ai/glm-5.2';

const SYSTEM_PROMPT =
  'You are a nutrition analysis AI. Parse meal descriptions into individual food items with macro estimates. ' +
  'Use standard USDA nutrition data as your reference. Return ONLY valid JSON with no markdown or commentary. ' +
  'For each food, provide the most accurate macronutrient breakdown you can based on standard serving sizes. ' +
  'Pay close attention to quantities mentioned (e.g. "6 oz chicken breast", "2 eggs", "1 cup rice") and ' +
  'convert to standard USDA portion values — never guess a portion when the user specifies one. ' +
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

async function callPrimaryProvider(description: string, mealSlot: MealSlot): Promise<ProviderAttempt> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) {
    return {
      provider: 'openrouter',
      model: OPENROUTER_MODEL,
      response: new Response('provider key not configured', { status: 500 }),
    };
  }
  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Meal slot: ${mealSlot}\nMeal description: ${description}` },
      ],
      temperature: 0.1,
      max_tokens: 2048,
      stream: false,
      response_format: { type: 'json_object' },
    }),
  });
  return { provider: 'openrouter', model: OPENROUTER_MODEL, response };
}

async function callFallbackProvider(
  description: string,
  mealSlot: MealSlot,
): Promise<ProviderAttempt | null> {
  const apiKey = Deno.env.get('NVIDIA_API_KEY');
  if (!apiKey) return null;
  // NVIDIA API may not support response_format — send plain body.
  const response = await fetch(NVIDIA_API_URL, {
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
      temperature: 0.1,
      max_tokens: 2048,
      stream: false,
    }),
  });
  return { provider: 'nvidia', model: NVIDIA_MODEL, response };
}

const handler = createMacroHandler({
  verifyUser,
  consumeRateLimit,
  callPrimaryProvider,
  callFallbackProvider,
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
