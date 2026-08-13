import { describe, expect, it } from 'vitest';
import { sameUserId, stabilizeSession } from '~/lib/auth-session';
import type { Session, User } from '@supabase/supabase-js';

function user(id: string): User {
  return { id } as User;
}

function session(id: string, accessToken = 'a'): Session {
  return { access_token: accessToken, user: user(id) } as Session;
}

describe('stabilizeSession', () => {
  it('keeps the previous user object when the same user refreshes a token', () => {
    const previous = session('user-abc', 'old-token');
    const next = session('user-abc', 'new-token');
    const stabilized = stabilizeSession(previous, next);
    expect(stabilized).not.toBe(previous);
    expect(stabilized?.access_token).toBe('new-token');
    expect(stabilized?.user).toBe(previous.user);
  });

  it('accepts a new session when the user id changes', () => {
    const previous = session('user-abc');
    const next = session('user-other');
    expect(stabilizeSession(previous, next)).toBe(next);
  });

  it('clears the session on sign-out', () => {
    expect(stabilizeSession(session('user-abc'), null)).toBeNull();
  });

  it('treats missing users as different', () => {
    expect(sameUserId(undefined, user('user-abc'))).toBe(false);
    expect(sameUserId(user('user-abc'), null)).toBe(false);
  });
});
