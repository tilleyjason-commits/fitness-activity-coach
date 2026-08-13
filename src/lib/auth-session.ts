/**
 * Keep the authenticated identity stable across token refreshes.
 *
 * Mobile Safari / PWA backgrounding often fires TOKEN_REFRESHED with a new
 * session object. If callers treat that as a new user, they remount the
 * authenticated tree and wipe in-memory workout state.
 */
import type { Session, User } from '@supabase/supabase-js';

export function sameUserId(a: User | null | undefined, b: User | null | undefined): boolean {
  return Boolean(a?.id && b?.id && a.id === b.id);
}

/**
 * Keep the previous user object when only the token changed so React
 * identity (`user`) stays stable, but still adopt the refreshed tokens.
 */
export function stabilizeSession(previous: Session | null, next: Session | null): Session | null {
  if (!next) return null;
  if (!previous || !sameUserId(previous.user, next.user)) return next;
  if (previous.user === next.user && previous.access_token === next.access_token) {
    return previous;
  }
  return { ...next, user: previous.user };
}
