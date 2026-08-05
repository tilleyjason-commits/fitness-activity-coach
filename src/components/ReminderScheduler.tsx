import { useEffect } from 'react';
import { useAuth } from '~/context/AuthContext';
import { getProfile } from '~/lib/db';
import { resolveMealTiming } from '~/lib/constants';
import { buildTodayReminders, getReminderPrefs, scheduleTodayReminders } from '~/lib/reminders';

/**
 * Non-visual: schedules today's opt-in coaching reminders (see
 * src/lib/reminders.ts) once per signed-in session. Renders nothing.
 */
export function ReminderScheduler() {
  const { user } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let cancelSchedule = () => {};

    getProfile(userId)
      .then((profile) => {
        if (cancelled) return;
        const prefs = getReminderPrefs(userId);
        const timing = resolveMealTiming(profile);
        cancelSchedule = scheduleTodayReminders(buildTodayReminders(timing), prefs);
      })
      .catch(() => {
        // No profile / offline — reminders simply don't schedule this session.
      });

    return () => {
      cancelled = true;
      cancelSchedule();
    };
  }, [userId]);

  return null;
}
