import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMacroHandler, type MacroHandlerDeps } from './handler';

/**
 * Unit tests for the calculate-macros Edge Function core. The handler is
 * dependency-injected so these tests cover auth rejection, rate limiting,
 * provider failure mapping, malformed provider output, and log hygiene
 * without Deno or network access.
 */

const DESCRIPTION = 'grilled chicken breast with rice and a secret sauce';

function providerOk(content: unknown): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }),
    { status: 200 },
  );
}

function makeDeps(overrides: Partial<MacroHandlerDeps> = {}): MacroHandlerDeps {
  return {
    verifyUser: vi.fn().mockResolvedValue('user-1'),
    consumeRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
    callProvider: vi.fn().mockResolvedValue(
      providerOk({
        foods: [
          {
            food_name: 'Chicken breast',
            quantity: 1,
            unit: 'breast',
            calories: 165,
            protein_g: 31,
            carbs_g: 0,
            fat_g: 3.6,
            confidence: 'high',
          },
        ],
        meal_total: { calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6 },
      }),
    ),
    log: vi.fn(),
    ...overrides,
  };
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/calculate-macros', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = { description: DESCRIPTION, meal_slot: 'lunch' };
const AUTH = { Authorization: 'Bearer some-user-jwt' };

describe('calculate-macros handler', () => {
  let deps: MacroHandlerDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  it('rejects requests without an Authorization header with 401 before touching the provider', async () => {
    const handler = createMacroHandler(deps);
    const res = await handler(post(VALID_BODY));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('unauthenticated');
    expect(deps.callProvider).not.toHaveBeenCalled();
    expect(deps.consumeRateLimit).not.toHaveBeenCalled();
  });

  it('rejects an invalid/expired JWT with 401 before touching the provider', async () => {
    deps = makeDeps({ verifyUser: vi.fn().mockResolvedValue(null) });
    const handler = createMacroHandler(deps);
    const res = await handler(post(VALID_BODY, AUTH));
    expect(res.status).toBe(401);
    expect(deps.callProvider).not.toHaveBeenCalled();
  });

  it('never trusts a user id in the request JSON — identity comes from the verified JWT only', async () => {
    const handler = createMacroHandler(deps);
    await handler(post({ ...VALID_BODY, user_id: 'attacker-uuid' }, AUTH));
    expect(deps.consumeRateLimit).toHaveBeenCalledTimes(1);
    const [rateArg] = (deps.consumeRateLimit as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(rateArg).not.toBe('attacker-uuid');
  });

  it('returns 429 with a structured code when the per-user limit is exhausted', async () => {
    deps = makeDeps({
      consumeRateLimit: vi.fn().mockResolvedValue({
        allowed: false,
        reason: 'hour',
        retry_after_seconds: 1800,
      }),
    });
    const handler = createMacroHandler(deps);
    const res = await handler(post(VALID_BODY, AUTH));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.code).toBe('rate_limited');
    expect(deps.callProvider).not.toHaveBeenCalled();
  });

  it('returns 400 with a validation code for a bad body', async () => {
    const handler = createMacroHandler(deps);
    const res = await handler(post({ description: '', meal_slot: 'elevenses' }, AUTH));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_request');
    expect(deps.callProvider).not.toHaveBeenCalled();
  });

  it('maps a provider 429 to a structured 503 provider_unavailable (not a fake success, no silent fallback)', async () => {
    deps = makeDeps({
      callProvider: vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 })),
    });
    const handler = createMacroHandler(deps);
    const res = await handler(post(VALID_BODY, AUTH));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe('provider_unavailable');
    expect(body.error.message).toMatch(/rate-limiting/i);
    // One initial call + one retry on transient 429.
    expect(deps.callProvider).toHaveBeenCalledTimes(2);
  });

  it('maps a provider 401/403 to an API-key guidance message', async () => {
    deps = makeDeps({
      callProvider: vi.fn().mockResolvedValue(new Response('forbidden', { status: 403 })),
    });
    const handler = createMacroHandler(deps);
    const res = await handler(post(VALID_BODY, AUTH));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.message).toMatch(/API key/i);
  });

  it('maps malformed provider output to a structured 502 without echoing provider content', async () => {
    deps = makeDeps({
      callProvider: vi.fn().mockResolvedValue(providerOk('this is not the JSON you are looking for')),
    });
    const handler = createMacroHandler(deps);
    const res = await handler(post(VALID_BODY, AUTH));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe('provider_invalid_output');
  });

  it('returns normalized foods with server-recomputed totals on success', async () => {
    const handler = createMacroHandler(deps);
    const res = await handler(post(VALID_BODY, AUTH));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.foods).toHaveLength(1);
    expect(body.meal_total).toEqual({ calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6 });
  });

  it('accepts an authenticated pre_workout_snack request and passes that exact slot to the provider', async () => {
    const handler = createMacroHandler(deps);
    const res = await handler(post({ description: DESCRIPTION, meal_slot: 'pre_workout_snack' }, AUTH));
    expect(res.status).toBe(200);
    expect(deps.callProvider).toHaveBeenCalledWith(DESCRIPTION, 'pre_workout_snack');
  });

  it('accepts an authenticated bedtime_snack request and passes that exact slot to the provider', async () => {
    const handler = createMacroHandler(deps);
    const res = await handler(post({ description: DESCRIPTION, meal_slot: 'bedtime_snack' }, AUTH));
    expect(res.status).toBe(200);
    expect(deps.callProvider).toHaveBeenCalledWith(DESCRIPTION, 'bedtime_snack');
  });

  it('still rejects an unknown slot with 400 before rate limiting or provider access', async () => {
    const handler = createMacroHandler(deps);
    const res = await handler(post({ description: DESCRIPTION, meal_slot: 'midnight_feast' }, AUTH));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_request');
    expect(deps.consumeRateLimit).not.toHaveBeenCalled();
    expect(deps.callProvider).not.toHaveBeenCalled();
  });

  it('never logs the meal description, auth header, or provider body', async () => {
    deps = makeDeps({
      callProvider: vi.fn().mockResolvedValue(
        new Response('provider secret sauce diagnostics', { status: 500 }),
      ),
    });
    const handler = createMacroHandler(deps);
    await handler(post(VALID_BODY, AUTH));

    const logged = (deps.log as ReturnType<typeof vi.fn>).mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logged).not.toContain('secret sauce');
    expect(logged).not.toContain('some-user-jwt');
    expect(logged).not.toContain(DESCRIPTION);
  });
});
