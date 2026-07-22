import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMacroHandler,
  type MacroHandlerDeps,
  type ProviderAttempt,
} from './handler';

/**
 * Unit tests for the calculate-macros Edge Function core. The handler is
 * dependency-injected so these tests cover auth rejection, rate limiting,
 * NVIDIA→DeepSeek fallback (never silent), provider failure mapping, and
 * log hygiene without Deno or network access.
 */

const DESCRIPTION = 'grilled chicken breast with rice and a secret sauce';

function providerOk(content: unknown): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }),
    { status: 200 },
  );
}

const SAMPLE_FOODS = {
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
};

function nvidiaOk(): ProviderAttempt {
  return { provider: 'nvidia', model: 'z-ai/glm-5.2', response: providerOk(SAMPLE_FOODS) };
}

function deepseekOk(): ProviderAttempt {
  return {
    provider: 'deepseek',
    model: 'deepseek-chat',
    response: providerOk(SAMPLE_FOODS),
  };
}

function makeDeps(overrides: Partial<MacroHandlerDeps> = {}): MacroHandlerDeps {
  return {
    verifyUser: vi.fn().mockResolvedValue('user-1'),
    consumeRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
    callPrimaryProvider: vi.fn().mockResolvedValue(nvidiaOk()),
    callFallbackProvider: vi.fn().mockResolvedValue(deepseekOk()),
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
    expect(deps.callPrimaryProvider).not.toHaveBeenCalled();
    expect(deps.consumeRateLimit).not.toHaveBeenCalled();
  });

  it('rejects an invalid/expired JWT with 401 before touching the provider', async () => {
    deps = makeDeps({ verifyUser: vi.fn().mockResolvedValue(null) });
    const handler = createMacroHandler(deps);
    const res = await handler(post(VALID_BODY, AUTH));
    expect(res.status).toBe(401);
    expect(deps.callPrimaryProvider).not.toHaveBeenCalled();
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
    expect(deps.callPrimaryProvider).not.toHaveBeenCalled();
  });

  it('returns NVIDIA success without calling DeepSeek and sets fallback:false', async () => {
    const handler = createMacroHandler(deps);
    const res = await handler(post(VALID_BODY, AUTH));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider).toBe('nvidia');
    expect(body.model).toBe('z-ai/glm-5.2');
    expect(body.fallback).toBe(false);
    expect(body.foods).toHaveLength(1);
    expect(deps.callFallbackProvider).not.toHaveBeenCalled();
  });

  it('falls back to DeepSeek on NVIDIA 429 and announces fallback:true (never silent)', async () => {
    deps = makeDeps({
      callPrimaryProvider: vi.fn().mockResolvedValue({
        provider: 'nvidia',
        model: 'z-ai/glm-5.2',
        response: new Response('rate limited', { status: 429 }),
      }),
    });
    const handler = createMacroHandler(deps);
    const res = await handler(post(VALID_BODY, AUTH));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fallback).toBe(true);
    expect(body.provider).toBe('deepseek');
    expect(body.model).toBe('deepseek-chat');
    expect(body.fallback_reason).toMatch(/rate-limiting|NVIDIA/i);
    expect(deps.callFallbackProvider).toHaveBeenCalledTimes(1);
    // NVIDIA gets one initial attempt + one retry on transient 429.
    expect(deps.callPrimaryProvider).toHaveBeenCalledTimes(2);
  });

  it('falls back to DeepSeek when NVIDIA output is unparseable', async () => {
    deps = makeDeps({
      callPrimaryProvider: vi.fn().mockResolvedValue({
        provider: 'nvidia',
        model: 'z-ai/glm-5.2',
        response: providerOk('this is not the JSON you are looking for'),
      }),
    });
    const handler = createMacroHandler(deps);
    const res = await handler(post(VALID_BODY, AUTH));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fallback).toBe(true);
    expect(body.provider).toBe('deepseek');
  });

  it('returns 503 when NVIDIA fails and DeepSeek is not configured', async () => {
    deps = makeDeps({
      callPrimaryProvider: vi.fn().mockResolvedValue({
        provider: 'nvidia',
        model: 'z-ai/glm-5.2',
        response: new Response('rate limited', { status: 429 }),
      }),
      callFallbackProvider: vi.fn().mockResolvedValue(null),
    });
    const handler = createMacroHandler(deps);
    const res = await handler(post(VALID_BODY, AUTH));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe('provider_unavailable');
    expect(body.error.message).toMatch(/DEEPSEEK_API_KEY|not configured/i);
  });

  it('returns 503 when both providers fail', async () => {
    deps = makeDeps({
      callPrimaryProvider: vi.fn().mockResolvedValue({
        provider: 'nvidia',
        model: 'z-ai/glm-5.2',
        response: new Response('down', { status: 503 }),
      }),
      callFallbackProvider: vi.fn().mockResolvedValue({
        provider: 'deepseek',
        model: 'deepseek-chat',
        response: new Response('down', { status: 503 }),
      }),
    });
    const handler = createMacroHandler(deps);
    const res = await handler(post(VALID_BODY, AUTH));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe('provider_unavailable');
    expect(body.error.message).toMatch(/DeepSeek/i);
  });

  it('accepts authenticated pre_workout_snack and bedtime_snack slots', async () => {
    const handler = createMacroHandler(deps);
    for (const meal_slot of ['pre_workout_snack', 'bedtime_snack'] as const) {
      const res = await handler(post({ description: DESCRIPTION, meal_slot }, AUTH));
      expect(res.status).toBe(200);
      expect(deps.callPrimaryProvider).toHaveBeenCalledWith(DESCRIPTION, meal_slot);
    }
  });

  it('still rejects an unknown slot with 400 before rate limiting or provider access', async () => {
    const handler = createMacroHandler(deps);
    const res = await handler(post({ description: DESCRIPTION, meal_slot: 'brunch' }, AUTH));
    expect(res.status).toBe(400);
    expect(deps.consumeRateLimit).not.toHaveBeenCalled();
    expect(deps.callPrimaryProvider).not.toHaveBeenCalled();
  });

  it('never logs the meal description, auth header, or provider body', async () => {
    deps = makeDeps({
      callPrimaryProvider: vi.fn().mockResolvedValue({
        provider: 'nvidia',
        model: 'z-ai/glm-5.2',
        response: new Response('provider secret sauce diagnostics', { status: 500 }),
      }),
      callFallbackProvider: vi.fn().mockResolvedValue({
        provider: 'deepseek',
        model: 'deepseek-chat',
        response: new Response('also secret', { status: 500 }),
      }),
    });
    const handler = createMacroHandler(deps);
    await handler(post(VALID_BODY, AUTH));
    const logs = (deps.log as ReturnType<typeof vi.fn>).mock.calls.flat().join(' ');
    expect(logs).not.toMatch(/secret sauce|also secret|Bearer|grilled chicken/i);
  });
});
