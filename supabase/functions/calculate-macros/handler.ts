// Runtime-neutral core of the calculate-macros Edge Function.
//
// index.ts wires this to Deno.serve with real dependencies; unit tests inject
// fakes. Uses only web-standard Request/Response so it runs under Deno and
// under Vitest (Node) unchanged.
//
// Response contract (structured errors, machine-readable code):
//   200 { foods, meal_total }
//   400 { error: { code: 'invalid_request' } }        — bad body
//   401 { error: { code: 'unauthenticated' } }        — missing/invalid JWT
//   429 { error: { code: 'rate_limited', retry_after_seconds? } } — app limit
//   502 { error: { code: 'provider_invalid_output' } }— unparseable model output
//   503 { error: { code: 'provider_unavailable' } }   — provider 429/5xx/network
//   500 { error: { code: 'internal' } }               — unexpected fault
//
// Log hygiene: nothing user-supplied (meal descriptions), no auth headers, no
// provider response bodies — only codes, statuses, and lengths.

export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'post_gym', 'snack'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export interface AIFood {
  food_name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface RateLimitDecision {
  allowed: boolean;
  reason?: string;
  retry_after_seconds?: number;
}

export interface MacroHandlerDeps {
  /** Resolve the verified Supabase user id from the Authorization header, or null. */
  verifyUser: (authHeader: string) => Promise<string | null>;
  /**
   * Atomically record one attempt for the verified user and decide whether it
   * is within quota. Server-enforced (DB RPC) — never process memory.
   */
  consumeRateLimit: (userId: string, authHeader: string) => Promise<RateLimitDecision>;
  /** Perform the provider chat-completion call. */
  callProvider: (description: string, mealSlot: MealSlot) => Promise<Response>;
  /** Sink for diagnostic logging (console.error in production). */
  log: (...parts: string[]) => void;
}

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

function errorResponse(status: number, code: string, message: string, extra?: Record<string, unknown>): Response {
  return jsonResponse({ error: { code, message, ...extra } }, status);
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

export function createMacroHandler(deps: MacroHandlerDeps) {
  return async function handle(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }
    if (req.method !== 'POST') {
      return errorResponse(405, 'method_not_allowed', 'Method not allowed');
    }

    try {
      // 1. Authentication — before any body parsing or provider work.
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return errorResponse(401, 'unauthenticated', 'A signed-in user is required.');
      }
      let userId: string | null = null;
      try {
        userId = await deps.verifyUser(authHeader);
      } catch {
        userId = null;
      }
      if (!userId) {
        return errorResponse(401, 'unauthenticated', 'A signed-in user is required.');
      }

      // 2. Validation. The user identity is NEVER read from the body.
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
        return errorResponse(400, 'invalid_request', message);
      }

      // 3. Server-enforced per-user quota (counts attempts, success or not).
      const decision = await deps.consumeRateLimit(userId, authHeader);
      if (!decision.allowed) {
        deps.log(`calculate-macros rate limited (${decision.reason ?? 'quota'})`);
        return errorResponse(
          429,
          'rate_limited',
          'You have reached the AI calculation limit. Try again later or enter macros manually.',
          decision.retry_after_seconds !== undefined
            ? { retry_after_seconds: decision.retry_after_seconds }
            : undefined,
        );
      }

      // 4. Provider call.
      let providerRes: Response;
      try {
        providerRes = await deps.callProvider(description, mealSlot);
      } catch {
        deps.log('calculate-macros provider network failure');
        return errorResponse(503, 'provider_unavailable', 'The AI provider is unreachable. Try again soon or enter macros manually.');
      }

      if (!providerRes.ok) {
        // Log the status only — provider bodies can echo user content.
        deps.log(`calculate-macros provider error status=${providerRes.status}`);
        return errorResponse(
          503,
          'provider_unavailable',
          'The AI provider is temporarily unavailable. Try again soon or enter macros manually.',
        );
      }

      try {
        const completion = (await providerRes.json()) as {
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
      } catch {
        deps.log('calculate-macros provider output unparseable');
        return errorResponse(
          502,
          'provider_invalid_output',
          'The AI response could not be understood. Try again or enter macros manually.',
        );
      }
    } catch {
      deps.log('calculate-macros unexpected fault');
      return errorResponse(500, 'internal', 'Unexpected error.');
    }
  };
}
