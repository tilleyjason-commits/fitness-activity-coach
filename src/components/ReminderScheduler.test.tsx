import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ReminderScheduler } from '~/components/ReminderScheduler';
import type { Profile } from '~/lib/types';

const getProfileMock = vi.fn();
vi.mock('~/lib/db', () => ({
  getProfile: (...args: unknown[]) => getProfileMock(...args),
}));

const AUTH_VALUE: { user: { id: string } | null } = { user: { id: 'user-1' } };
vi.mock('~/context/AuthContext', () => ({
  useAuth: () => AUTH_VALUE,
}));

const scheduleTodayRemindersMock = vi.fn();
const cancelMock = vi.fn();
vi.mock('~/lib/reminders', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/reminders')>();
  return {
    ...actual,
    scheduleTodayReminders: (...args: unknown[]) => {
      scheduleTodayRemindersMock(...args);
      return cancelMock;
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  AUTH_VALUE.user = { id: 'user-1' };
  getProfileMock.mockResolvedValue({ training_time: '11:00' } as Profile);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ReminderScheduler', () => {
  it('renders nothing', () => {
    const { container } = render(<ReminderScheduler />);
    expect(container).toBeEmptyDOMElement();
  });

  it('schedules reminders once the profile loads', async () => {
    render(<ReminderScheduler />);
    await vi.waitFor(() => expect(scheduleTodayRemindersMock).toHaveBeenCalledTimes(1));
  });

  it('does nothing when signed out', async () => {
    AUTH_VALUE.user = null;
    render(<ReminderScheduler />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(getProfileMock).not.toHaveBeenCalled();
    expect(scheduleTodayRemindersMock).not.toHaveBeenCalled();
  });

  it('cancels the pending schedule on unmount', async () => {
    const { unmount } = render(<ReminderScheduler />);
    await vi.waitFor(() => expect(scheduleTodayRemindersMock).toHaveBeenCalledTimes(1));
    unmount();
    expect(cancelMock).toHaveBeenCalledTimes(1);
  });
});
