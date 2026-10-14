import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '~/context/AuthContext';
import { Logo } from '~/components/Logo';

const MIN_LENGTH = 8;

/** Reached from the password-recovery email. Needs the one-time recovery session. */
export default function ResetPassword() {
  const { user, loading, passwordRecovery, updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;
  // Opened directly (no recovery link): nothing to reset.
  if (!user || !passwordRecovery) return <Navigate to={user ? '/' : '/login'} replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const message = await updatePassword(password);
      if (message) setError(message);
      else navigate('/', { replace: true });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-10">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <Logo size={64} />
        <h1 className="text-display font-bold">Choose a new password</h1>
      </div>
      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label htmlFor="new-password" className="label">
            New password
          </label>
          <input
            id="new-password"
            type="password"
            required
            minLength={MIN_LENGTH}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field"
          />
        </div>
        <div>
          <label htmlFor="confirm-password" className="label">
            Confirm new password
          </label>
          <input
            id="confirm-password"
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="field"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Save new password
        </button>
      </form>
    </div>
  );
}
