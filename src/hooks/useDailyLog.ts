import { useCallback, useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { useAuth } from '~/context/AuthContext';
import { getDailyLog, upsertDailyLog } from '~/lib/db';
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

/** CRUD for one daily_logs row, keyed by (current user, date). */
export function useDailyLog(date: string): UseDailyLogResult {
  const { user } = useAuth();
  const [log, setLog] = useState<DailyLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!user) {
      setLog(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setLog(await getDailyLog(user.id, date));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load log');
    } finally {
      setLoading(false);
    }
  }, [user, date]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(
    async (patch: Partial<DailyLog>): Promise<DailyLog | null> => {
      if (!user) return null;
      setSaving(true);
      setError(null);
      try {
        const saved = await upsertDailyLog({
          user_id: user.id,
          log_date: date,
          day_of_week: format(parseISO(date), 'EEEE'),
          ...patch,
        });
        setLog(saved);
        return saved;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save log');
        return null;
      } finally {
        setSaving(false);
      }
    },
    [user, date],
  );

  return { log, loading, saving, error, save, reload };
}
