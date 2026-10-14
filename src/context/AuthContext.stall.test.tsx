import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { AuthProvider, useAuth } from '~/context/AuthContext';

let resolveSession: (v: { data: { session: null } }) => void = () => {};
vi.mock('~/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => new Promise((resolve) => (resolveSession = resolve)),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signOut: vi.fn(),
    },
  },
}));

function Probe() {
  const { loading, stalled, user } = useAuth();
  return <p>{`loading=${loading} stalled=${stalled} user=${user ? 'yes' : 'no'}`}</p>;
}

describe('AuthProvider slow session lookup', () => {
  afterEach(() => vi.useRealTimers());

  it('stays loading (not signed out) after 3 seconds and only flags it as stalled', async () => {
    vi.useFakeTimers();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await act(async () => {
      vi.advanceTimersByTime(3500);
    });
    expect(screen.getByText('loading=true stalled=true user=no')).toBeInTheDocument();

    await act(async () => {
      resolveSession({ data: { session: null } });
    });
    expect(screen.getByText('loading=false stalled=false user=no')).toBeInTheDocument();
  });
});
