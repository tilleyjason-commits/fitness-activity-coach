import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Settings from '~/pages/Settings';
import { getReminderPrefs } from '~/lib/reminders';

vi.mock('~/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 't@t.com' },
    signOut: vi.fn(),
  }),
}));

vi.mock('~/lib/db', () => ({
  getProfile: () => Promise.resolve(null),
  upsertProfile: vi.fn(),
}));

let notificationCtor: ReturnType<typeof vi.fn>;
let permission: NotificationPermission;

function renderSettings() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Settings />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  permission = 'default';
  notificationCtor = vi.fn();
  Object.defineProperty(notificationCtor, 'permission', {
    configurable: true,
    get: () => permission,
  });
  (notificationCtor as unknown as { requestPermission: unknown }).requestPermission = vi
    .fn()
    .mockImplementation(async () => {
      permission = 'granted';
      return permission;
    });
  vi.stubGlobal('Notification', notificationCtor);
});

describe('Settings reminders', () => {
  it('starts disabled with the category toggles hidden', () => {
    renderSettings();
    const master = screen.getByRole('switch', { name: /reminders/i });
    expect(master).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByRole('switch', { name: /training time/i })).not.toBeInTheDocument();
  });

  it('requests permission, persists, and reveals per-category toggles on enable', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole('switch', { name: /^reminders/i }));

    expect(
      (notificationCtor as unknown as { requestPermission: ReturnType<typeof vi.fn> })
        .requestPermission,
    ).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('switch', { name: /training time/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(getReminderPrefs('user-1').enabled).toBe(true);
  });

  it('shows a blocked message and stays off when permission is denied', async () => {
    permission = 'denied';
    (notificationCtor as unknown as { requestPermission: ReturnType<typeof vi.fn> }).requestPermission =
      vi.fn().mockResolvedValue('denied');
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole('switch', { name: /^reminders/i }));

    expect(await screen.findByText(/notifications are blocked/i)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /^reminders/i })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(getReminderPrefs('user-1').enabled).toBe(false);
  });

  it('turning off a single category persists without disabling the others', async () => {
    permission = 'granted';
    const user = userEvent.setup();
    renderSettings();
    await user.click(screen.getByRole('switch', { name: /^reminders/i }));
    await screen.findByRole('switch', { name: /training time/i });

    await user.click(screen.getByRole('switch', { name: /afternoon snack/i }));

    const prefs = getReminderPrefs('user-1');
    expect(prefs.enabled).toBe(true);
    expect(prefs.categories.snack).toBe(false);
    expect(prefs.categories.training).toBe(true);
  });
});
