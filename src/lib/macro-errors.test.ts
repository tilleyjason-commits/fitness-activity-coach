import { describe, expect, it } from 'vitest';
import { describeFunctionsInvokeError, macroErrorMessage } from '~/lib/macro-errors';

describe('macroErrorMessage', () => {
  it('maps 401 unauthenticated to a sign-in message', () => {
    const msg = macroErrorMessage(401, { error: { code: 'unauthenticated' } });
    expect(msg).toMatch(/sign in/i);
  });

  it('prefers the structured server message for the app rate limit', () => {
    const msg = macroErrorMessage(429, {
      error: { code: 'rate_limited', message: 'You have reached the AI calculation limit.' },
    });
    expect(msg).toMatch(/limit/i);
    expect(msg).toMatch(/manual/i);
  });

  it('maps provider unavailability to an actionable manual-entry message', () => {
    const msg = macroErrorMessage(503, { error: { code: 'provider_unavailable' } });
    expect(msg).toMatch(/unavailable|try again/i);
    expect(msg).toMatch(/manual/i);
  });

  it('falls back to a generic retryable message when nothing structured is present', () => {
    const msg = macroErrorMessage(null, null);
    expect(msg.length).toBeGreaterThan(10);
  });
});

describe('describeFunctionsInvokeError', () => {
  it('reads status and structured body from a FunctionsHttpError-style context Response', async () => {
    const error = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      context: new Response(
        JSON.stringify({ error: { code: 'rate_limited', message: 'Limit reached.' } }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      ),
    });
    const msg = await describeFunctionsInvokeError(error);
    expect(msg).toMatch(/limit/i);
  });

  it('handles network-style errors without a context Response', async () => {
    const msg = await describeFunctionsInvokeError(new Error('Failed to send a request'));
    expect(msg.length).toBeGreaterThan(10);
  });
});
