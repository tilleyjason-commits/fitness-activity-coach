/**
 * Maps calculate-macros Edge Function failures onto user-facing messages.
 * Every message keeps the manual-entry path visible: AI failures must be
 * actionable and must never dead-end the meal logger.
 */

export interface MacroErrorBody {
  error?: {
    code?: string;
    message?: string;
    retry_after_seconds?: number;
  };
}

export function macroErrorMessage(status: number | null, body: MacroErrorBody | null): string {
  const code = body?.error?.code;
  const serverMessage = body?.error?.message;

  if (status === 401 || code === 'unauthenticated') {
    return 'Your session has expired. Sign in again to use AI calculation, or add foods manually.';
  }
  if (status === 429 || code === 'rate_limited') {
    return `${serverMessage ?? 'You have reached the AI calculation limit for now.'} You can still add foods manually.`;
  }
  if (status === 503 || status === 502 || code === 'provider_unavailable' || code === 'provider_invalid_output') {
    return `${serverMessage ?? 'The AI service is temporarily unavailable.'} Try again soon or add foods manually.`;
  }
  if (status === 400 || code === 'invalid_request') {
    return serverMessage ?? 'The meal description could not be processed. Adjust it and try again.';
  }
  if (serverMessage) return serverMessage;
  return 'Macro calculation failed. Try again, or add foods manually.';
}

/**
 * supabase.functions.invoke() surfaces non-2xx responses as a
 * FunctionsHttpError whose `context` is the raw Response. Pull the structured
 * error body out of it; fall back to a generic retryable message.
 */
export async function describeFunctionsInvokeError(error: unknown): Promise<string> {
  const context = (error as { context?: unknown }).context;
  if (context instanceof Response) {
    let body: MacroErrorBody | null = null;
    try {
      body = (await context.clone().json()) as MacroErrorBody;
    } catch {
      body = null;
    }
    return macroErrorMessage(context.status, body);
  }
  return macroErrorMessage(null, null);
}
