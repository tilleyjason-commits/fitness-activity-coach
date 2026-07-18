import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { AlertTriangle, Dumbbell, Loader2 } from 'lucide-react';
import { useAuth } from '~/context/AuthContext';
import { isSupabaseConfigured } from '~/lib/supabase';

type Mode = 'signin' | 'signup';

export default function Login() {
  const { user, loading, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      if (mode === 'signin') {
        const message = await signIn(email, password);
        if (message) setError(message);
      } else {
        const message = await signUp(email, password);
        if (message) {
          setError(message);
        } else {
          setNotice('Account created. Check your email for a confirmation link, then sign in.');
          setMode('signin');
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-10">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <span className="rounded-2xl bg-emerald-500/15 p-4">
          <Dumbbell className="h-9 w-9 text-emerald-500" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-bold">Fitness Activity Coach</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Daily logging, evidence-based coaching.
          </p>
        </div>
      </div>

      {!isSupabaseConfigured && (
        <div className="card mb-4 flex items-start gap-3 border-l-4 border-l-amber-500">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden />
          <p className="text-sm text-slate-700 dark:text-slate-200">
            Supabase is not configured. Copy <code>.env.example</code> to <code>.env.local</code> and
            set <code>VITE_SUPABASE_URL</code> / <code>VITE_SUPABASE_ANON_KEY</code>, then restart the
            dev server.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label htmlFor="email" className="label">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label htmlFor="password" className="label">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field"
            placeholder="••••••••"
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
        {notice && <p className="text-sm text-emerald-600 dark:text-emerald-400">{notice}</p>}

        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin');
          setError(null);
          setNotice(null);
        }}
        className="mt-4 text-center text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400"
      >
        {mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}
      </button>
    </div>
  );
}
