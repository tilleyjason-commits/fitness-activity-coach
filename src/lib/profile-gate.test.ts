import { beforeEach, describe, expect, it } from 'vitest';
import { isProfileComplete, resolveProfileGate } from '~/lib/profile-gate';

describe('profile gate', () => {
  beforeEach(() => localStorage.clear());

  it('requires both age and height', () => {
    expect(isProfileComplete(null)).toBe(false);
    expect(isProfileComplete({ age: 40, height_cm: null })).toBe(false);
    expect(isProfileComplete({ age: null, height_cm: 180 })).toBe(false);
    expect(isProfileComplete({ age: 40, height_cm: 180 })).toBe(true);
  });

  it('sends a user with no profile or an incomplete one to setup', () => {
    expect(resolveProfileGate('u1', { ok: true, profile: null })).toBe('needs-setup');
    expect(resolveProfileGate('u1', { ok: true, profile: { age: null, height_cm: 180 } })).toBe(
      'needs-setup',
    );
  });

  it('fails closed on a lookup error for a user never seen complete', () => {
    expect(resolveProfileGate('new-user', { ok: false })).toBe('error');
  });

  it('lets a known-complete user in when the lookup fails (offline use)', () => {
    expect(resolveProfileGate('u1', { ok: true, profile: { age: 40, height_cm: 180 } })).toBe('ready');
    expect(resolveProfileGate('u1', { ok: false })).toBe('ready');
    expect(resolveProfileGate('someone-else', { ok: false })).toBe('error');
  });
});
