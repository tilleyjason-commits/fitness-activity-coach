/**
 * Opt-in local coaching reminders (train / 3pm snack / caffeine cutoff /
 * bedtime). These use the browser Notification API, scheduled with
 * setTimeout for the remainder of the current day — they only fire while
 * this tab/PWA instance stays open. There is no push subscription or
 * server-side scheduler, so a fully backgrounded/closed app will not
 * receive them; that's a real limitation, not a bug, and the Settings copy
 * says so.
 *
 * Preferences are local-only (localStorage), namespaced per user id — same
 * lesson as workout-offline-queue.ts and meal-favorites.ts: a shared device
 * must not leak one account's reminder settings into another's.
 */

import type { MealTiming } from './constants';

export type ReminderCategory = 'training' | 'snack' | 'caffeine' | 'bedtime';

export interface ReminderPrefs {
  enabled: boolean;
  categories: Record<ReminderCategory, boolean>;
}

export const DEFAULT_REMINDER_PREFS: ReminderPrefs = {
  enabled: false,
  categories: { training: true, snack: true, caffeine: true, bedtime: true },
};

const STORAGE_KEY_PREFIX = 'fac-reminder-prefs-v1';

function keyFor(userId: string): string {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

export function getReminderPrefs(userId: string): ReminderPrefs {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (!raw) return DEFAULT_REMINDER_PREFS;
    const parsed = JSON.parse(raw) as Partial<ReminderPrefs>;
    return {
      enabled: parsed.enabled ?? DEFAULT_REMINDER_PREFS.enabled,
      categories: { ...DEFAULT_REMINDER_PREFS.categories, ...parsed.categories },
    };
  } catch {
    return DEFAULT_REMINDER_PREFS;
  }
}

export function saveReminderPrefs(userId: string, prefs: ReminderPrefs): void {
  localStorage.setItem(keyFor(userId), JSON.stringify(prefs));
}

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission {
  return isNotificationSupported() ? Notification.permission : 'denied';
}

export async function requestReminderPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return 'denied';
  return Notification.requestPermission();
}

export interface ReminderDefinition {
  category: ReminderCategory;
  time: string;
  title: string;
  body: string;
}

/** Today's reminder set, anchored to the athlete's own timing (resolveMealTiming). */
export function buildTodayReminders(timing: MealTiming): ReminderDefinition[] {
  return [
    {
      category: 'training',
      time: timing.training,
      title: 'Training time',
      body: "It's go time — log today's workout when you start.",
    },
    {
      category: 'snack',
      time: timing.snack3pm,
      title: 'Scheduled snack',
      body: 'Time for your afternoon snack.',
    },
    {
      category: 'caffeine',
      time: timing.caffeineCutoff,
      title: 'Caffeine cutoff',
      body: 'Last call for caffeine — after this it can start cutting into tonight\'s sleep.',
    },
    {
      category: 'bedtime',
      time: timing.bedtime,
      title: 'Wind down',
      body: 'Bedtime is coming up — start winding down.',
    },
  ];
}

function minutesUntil(hhmm: string, now: Date): number {
  const [h, m] = hhmm.split(':').map(Number);
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 60000);
}

/**
 * Schedules whichever of today's enabled reminders haven't already passed.
 * Returns a cleanup function that cancels every pending timer — callers
 * (e.g. on sign-out or unmount) must call it to avoid a stray Notification
 * firing after the reminder no longer applies.
 */
export function scheduleTodayReminders(
  reminders: ReminderDefinition[],
  prefs: ReminderPrefs,
  now: Date = new Date(),
): () => void {
  if (!prefs.enabled || getNotificationPermission() !== 'granted') {
    return () => {};
  }
  const timers: ReturnType<typeof setTimeout>[] = [];
  for (const reminder of reminders) {
    if (!prefs.categories[reminder.category]) continue;
    const minutes = minutesUntil(reminder.time, now);
    if (minutes <= 0) continue; // already passed today
    timers.push(
      setTimeout(
        () => {
          new Notification(reminder.title, {
            body: reminder.body,
            tag: `fac-reminder-${reminder.category}`,
          });
        },
        minutes * 60000,
      ),
    );
  }
  return () => timers.forEach(clearTimeout);
}
