import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildTodayReminders,
  DEFAULT_REMINDER_PREFS,
  getReminderPrefs,
  saveReminderPrefs,
  scheduleTodayReminders,
  type ReminderPrefs,
} from '~/lib/reminders';
import type { MealTiming } from '~/lib/constants';

const TIMING: MealTiming = {
  preGymSnack: '10:15',
  training: '11:00',
  postGymMeal: '12:15',
  snack3pm: '15:00',
  casein: '20:00',
  caffeineCutoff: '14:00',
  bedtime: '22:00',
  waketime: '06:00',
};

const USER_A = 'user-a';
const USER_B = 'user-b';

let notificationCtor: ReturnType<typeof vi.fn>;
let permission: NotificationPermission;

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  notificationCtor = vi.fn();
  permission = 'granted';
  Object.defineProperty(notificationCtor, 'permission', {
    configurable: true,
    get: () => permission,
  });
  (notificationCtor as unknown as { requestPermission: unknown }).requestPermission = vi
    .fn()
    .mockResolvedValue('granted');
  vi.stubGlobal('Notification', notificationCtor);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('reminder prefs', () => {
  it('defaults to disabled with all categories on', () => {
    expect(getReminderPrefs(USER_A)).toEqual(DEFAULT_REMINDER_PREFS);
  });

  it('round-trips saved prefs', () => {
    const prefs: ReminderPrefs = {
      enabled: true,
      categories: { training: true, snack: false, caffeine: true, bedtime: false },
    };
    saveReminderPrefs(USER_A, prefs);
    expect(getReminderPrefs(USER_A)).toEqual(prefs);
  });

  it('keeps prefs isolated per user on a shared device', () => {
    saveReminderPrefs(USER_A, { ...DEFAULT_REMINDER_PREFS, enabled: true });
    saveReminderPrefs(USER_B, { ...DEFAULT_REMINDER_PREFS, enabled: false });
    expect(getReminderPrefs(USER_A).enabled).toBe(true);
    expect(getReminderPrefs(USER_B).enabled).toBe(false);
  });
});

describe('buildTodayReminders', () => {
  it('anchors all four reminders to the resolved timing', () => {
    const reminders = buildTodayReminders(TIMING);
    expect(reminders.map((r) => r.category)).toEqual(['training', 'snack', 'caffeine', 'bedtime']);
    expect(reminders.find((r) => r.category === 'training')?.time).toBe('11:00');
    expect(reminders.find((r) => r.category === 'caffeine')?.time).toBe('14:00');
  });
});

describe('scheduleTodayReminders', () => {
  it('does nothing when reminders are disabled', () => {
    vi.setSystemTime(new Date('2026-08-05T10:00:00'));
    const cancel = scheduleTodayReminders(buildTodayReminders(TIMING), {
      ...DEFAULT_REMINDER_PREFS,
      enabled: false,
    });
    vi.advanceTimersByTime(24 * 60 * 60000);
    expect(notificationCtor).not.toHaveBeenCalled();
    cancel();
  });

  it('does nothing without notification permission', () => {
    permission = 'denied';
    vi.setSystemTime(new Date('2026-08-05T10:00:00'));
    const cancel = scheduleTodayReminders(buildTodayReminders(TIMING), {
      ...DEFAULT_REMINDER_PREFS,
      enabled: true,
    });
    vi.advanceTimersByTime(24 * 60 * 60000);
    expect(notificationCtor).not.toHaveBeenCalled();
    cancel();
  });

  it('fires only future, enabled-category reminders and skips ones already past', () => {
    // 13:30 — training (11:00) and snack (15:00 not yet)... training already passed,
    // caffeine cutoff (14:00) and bedtime (22:00) are still ahead.
    const now = new Date('2026-08-05T13:30:00');
    scheduleTodayReminders(
      buildTodayReminders(TIMING),
      { enabled: true, categories: { training: true, snack: false, caffeine: true, bedtime: true } },
      now,
    );

    vi.setSystemTime(now);
    vi.advanceTimersByTime(29 * 60000); // 13:59 — nothing yet
    expect(notificationCtor).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2 * 60000); // 14:01 — caffeine cutoff fires
    expect(notificationCtor).toHaveBeenCalledTimes(1);
    expect(notificationCtor.mock.calls[0][0]).toBe('Caffeine cutoff');

    // snack was disabled and training already passed — neither ever fires,
    // even after advancing well past both.
    vi.advanceTimersByTime(2 * 60 * 60000);
    expect(notificationCtor).toHaveBeenCalledTimes(1);
  });

  it('cancel() prevents pending reminders from firing', () => {
    const now = new Date('2026-08-05T09:00:00');
    const cancel = scheduleTodayReminders(buildTodayReminders(TIMING), DEFAULT_REMINDER_PREFS, now);
    vi.setSystemTime(now);
    cancel();
    vi.advanceTimersByTime(24 * 60 * 60000);
    expect(notificationCtor).not.toHaveBeenCalled();
  });
});
