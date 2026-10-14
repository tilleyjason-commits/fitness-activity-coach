import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { stabilizeSession } from '~/lib/auth-session';
import { supabase } from '~/lib/supabase';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** True when the first session lookup is taking unusually long (still loading, NOT signed out). */
  stalled: boolean;
  /** Returns an error message on failure, null on success. */
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    let active = true;

    // If the first session lookup is slow (iOS Safari storage-lock hang), do NOT
    // pretend the user is signed out: that bounced valid sessions to /login.
    // Keep loading and flag it so the shell can offer retry / sign-in.
    const fallback = setTimeout(() => {
      if (active) {
        setStalled(true);
      }
    }, 3000);

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
        setLoading(false);
        setStalled(false);
        clearTimeout(fallback);
      })
      .catch(() => {
        // getSession rejected: there is no readable session, so this one is a
        // real "signed out" answer, not a slow one.
        if (active) {
          setLoading(false);
          setStalled(false);
          clearTimeout(fallback);
        }
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      // TOKEN_REFRESHED after a mobile window switch must not replace the
      // session object: a new user identity remounts AuthGuard and wipes
      // in-memory workout state.
      setSession((previous) => stabilizeSession(previous, next));
      setLoading(false);
      setStalled(false);
      clearTimeout(fallback);
    });

    return () => {
      active = false;
      clearTimeout(fallback);
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return error ? error.message : null;
  }, []);

  const signOut = useCallback(async () => {
    // Offline queues are stored under a per-user key, so a different account
    // signing in next can never see or flush them. They are intentionally left
    // in place so the same user's unsynced saves are still there on next login.
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      stalled,
      signIn,
      signUp,
      signOut,
    }),
    [session, loading, stalled, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return context;
}
