import { useCallback, useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { useAuth } from '~/context/AuthContext';
import { getDailyLog, upsertDailyLog } from '~/lib/db';
import {
  flushDailyLogSaveQueue,
  hasPendingDailyLogSaves,
  saveDailyLogWithOfflineQueue,
} from '~/lib/daily-log-offline-queue';
import type { DailyLog } from '~/lib/types';

interface UseDailyLogResult {
  log: DailyLog | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  /** Upsert a partial patch onto the day's row (creates it if missing). */
  save: (patch: Partial<DailyLog>) => Promise<DailyLog | null>;
  reload: () => Promise<void>;
}

function upsertForDate(userId: string, date: string, patch: Partial<DailyLog>): Promise<DailyLog> {
  return upsertDailyLog({
    user_id: userId,
    log_date: date,
    day_of_week: format(parseISO(date), 'EEEE'),
    ...patch,
  });
}

/** CRUD for one daily_logs row, keyed by (current user, date). */
export function useDailyLog(date: string): UseDailyLogResult {
  const { user } = useAuth();
  const userId = user?.id;
  const [log, setLog] = useState<DailyLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!userId) {
      setLog(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setLog(await getDailyLog(userId, date));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load log');
    } finally {
      setLoading(false);
    }
  }, [userId, date]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Drain any saves queued from an earlier offline session (any date, not
  // just this hook instance's) as soon as a user is available. Refresh this
  // instance's own row if the flush happened to include its date.
  useEffect(() => {
    if (!userId) return;
    if (!hasPendingDailyLogSaves(userId)) return;
    let cancelled = false;
    void flushDailyLogSaveQueue(userId, (flushDate, patch) => upsertForDate(userId, flushDate, patch)).then(
      (result) => {
        if (!cancelled && result.flushedDates.includes(date)) void reload();
      },
    );
    return () => {
      cancelled = true;
    };
  }, [userId, date, reload]);

  const save = useCallback(
    async (patch: Partial<DailyLog>): Promise<DailyLog | null> => {
      if (!userId) return null;
      setSaving(true);
      setError(null);
      try {
        const saved = await saveDailyLogWithOfflineQueue(userId, date, patch, (d, p) =>
          upsertForDate(userId, d, p),
        );
        setLog(saved);
        return saved;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save log');
        return null;
      } finally {
        setSaving(false);
      }
    },
    [userId, date],
  );

  return { log, loading, saving, error, save, reload };
}
