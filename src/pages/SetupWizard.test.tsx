import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import SetupWizard from '~/pages/SetupWizard';

/**
 * Regression: the wizard used to call navigate('/') even when the profile save
 * failed, silently dropping the user's onboarding data. It must navigate only
 * after a successful save, and on failure keep the entered values on screen
 * with an accessible, retryable error.
 */

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

const upsertProfileMock = vi.fn();
vi.mock('~/lib/db', () => ({
  upsertProfile: (...args: unknown[]) => upsertProfileMock(...args),
}));

vi.mock('~/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-abc' },
    session: null,
    loading: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  }),
}));

async function fillWizardToFinish() {
  const user = userEvent.setup();
  render(
    <MemoryRouter
      initialEntries={['/setup']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <SetupWizard />
    </MemoryRouter>,
  );

  await user.type(screen.getByLabelText(/age/i), '40');
  await user.type(screen.getByLabelText(/height/i), '180');
  await user.click(screen.getByRole('button', { name: /continue/i }));

  await user.type(screen.getByLabelText(/current weight/i), '210');
  await user.type(screen.getByLabelText(/body fat/i), '24');
  await user.click(screen.getByRole('button', { name: /continue/i }));

  return user;
}

describe('SetupWizard save behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('navigates home only after a successful save', async () => {
    upsertProfileMock.mockResolvedValue({ id: 'user-abc', user_id: 'user-abc' });
    const user = await fillWizardToFinish();

    await user.click(screen.getByRole('button', { name: /let'?s go/i }));

    expect(upsertProfileMock).toHaveBeenCalledTimes(1);
    const payload = upsertProfileMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.id).toBe('user-abc');
    expect(payload.user_id).toBe('user-abc');
    expect(payload.age).toBe(40);
    expect(navigateMock).toHaveBeenCalledWith('/');
  });

  it('stays on the wizard with an accessible retryable error when the save fails', async () => {
    upsertProfileMock.mockRejectedValue(new Error('null value in column "user_id"'));
    const user = await fillWizardToFinish();

    await user.click(screen.getByRole('button', { name: /let'?s go/i }));

    // Must NOT leave the page on failure.
    expect(navigateMock).not.toHaveBeenCalled();

    // Accessible error the user can act on.
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/user_id|failed|save/i);

    // Entered values are preserved (summary still shows them).
    expect(screen.getByText('210 lb')).toBeInTheDocument();
    expect(screen.getByText('24%')).toBeInTheDocument();

    // Retry succeeds and only then navigates.
    upsertProfileMock.mockResolvedValue({ id: 'user-abc', user_id: 'user-abc' });
    await user.click(screen.getByRole('button', { name: /let'?s go/i }));
    expect(upsertProfileMock).toHaveBeenCalledTimes(2);
    expect(navigateMock).toHaveBeenCalledWith('/');
  });
});
