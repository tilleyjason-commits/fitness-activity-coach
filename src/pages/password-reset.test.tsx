import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Login from '~/pages/Login';
import ResetPassword from '~/pages/ResetPassword';

const auth = {
  user: null as { id: string } | null,
  loading: false,
  passwordRecovery: false,
  signIn: vi.fn(),
  signUp: vi.fn(),
  resetPassword: vi.fn(),
  updatePassword: vi.fn(),
};
vi.mock('~/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('~/lib/supabase', () => ({ isSupabaseConfigured: true }));

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = null;
  auth.passwordRecovery = false;
});

describe('forgot password on the login page', () => {
  it('sends a reset email and shows a neutral confirmation', async () => {
    auth.resetPassword.mockResolvedValue(null);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /forgot your password/i }));
    expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/email/i), 'me@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(auth.resetPassword).toHaveBeenCalledWith('me@example.com');
    expect(await screen.findByText(/if an account exists/i)).toBeInTheDocument();
  });

  it('shows provider errors as an alert', async () => {
    auth.resetPassword.mockResolvedValue('email rate limit exceeded');
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /forgot your password/i }));
    await user.type(screen.getByLabelText(/email/i), 'me@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/rate limit/i);
  });
});

describe('reset password page', () => {
  function renderReset() {
    return render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <Routes>
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/" element={<p>home</p>} />
          <Route path="/login" element={<p>login</p>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('does nothing for someone who did not arrive from a recovery link', () => {
    auth.user = { id: 'u' };
    renderReset();
    expect(screen.getByText('home')).toBeInTheDocument();
  });

  it('rejects mismatched or short passwords without calling the API', async () => {
    auth.user = { id: 'u' };
    auth.passwordRecovery = true;
    const user = userEvent.setup();
    renderReset();
    await user.type(screen.getByLabelText(/^new password/i), 'correct-horse');
    await user.type(screen.getByLabelText(/confirm/i), 'different-one');
    await user.click(screen.getByRole('button', { name: /save new password/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i);
    expect(auth.updatePassword).not.toHaveBeenCalled();
  });

  it('saves a valid new password and goes home', async () => {
    auth.user = { id: 'u' };
    auth.passwordRecovery = true;
    auth.updatePassword.mockResolvedValue(null);
    const user = userEvent.setup();
    renderReset();
    await user.type(screen.getByLabelText(/^new password/i), 'correct-horse');
    await user.type(screen.getByLabelText(/confirm/i), 'correct-horse');
    await user.click(screen.getByRole('button', { name: /save new password/i }));
    expect(auth.updatePassword).toHaveBeenCalledWith('correct-horse');
    expect(await screen.findByText('home')).toBeInTheDocument();
  });
});
