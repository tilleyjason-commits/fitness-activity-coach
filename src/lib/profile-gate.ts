import type { Profile } from './types';

/**
 * The onboarding wizard requires age and height, so those two define a
 * "complete" profile. Weight or body fat alone (older Settings-only profiles)
 * does not count: such a user still has to finish setup.
 */
export function isProfileComplete(profile: Pick<Profile, 'age' | 'height_cm'> | null): boolean {
  return profile !== null && profile.age !== null && profile.height_cm !== null;
}

const KEY_PREFIX = 'fac-profile-complete-v1:';

/** Remember that this user finished setup, so a later network error cannot lock them out. */
export function rememberProfileComplete(userId: string): void {
  try {
    localStorage.setItem(KEY_PREFIX + userId, '1');
  } catch {
    // Storage unavailable; the gate falls back to its retry screen.
  }
}

export function wasProfileComplete(userId: string): boolean {
  try {
    return localStorage.getItem(KEY_PREFIX + userId) === '1';
  } catch {
    return false;
  }
}

export type ProfileGateOutcome = 'ready' | 'needs-setup' | 'error';

/**
 * Decide what the app shell does after a profile lookup.
 *  - lookup succeeded: complete => ready, otherwise => needs-setup
 *  - lookup failed: let a user who is known to have finished setup in (offline
 *    use must keep working); anyone else gets a retry screen, never the app
 *    with an empty profile and never a silent skip of onboarding.
 */
export function resolveProfileGate(
  userId: string,
  lookup: { ok: true; profile: Pick<Profile, 'age' | 'height_cm'> | null } | { ok: false },
): ProfileGateOutcome {
  if (lookup.ok) {
    if (isProfileComplete(lookup.profile)) {
      rememberProfileComplete(userId);
      return 'ready';
    }
    return 'needs-setup';
  }
  return wasProfileComplete(userId) ? 'ready' : 'error';
}
