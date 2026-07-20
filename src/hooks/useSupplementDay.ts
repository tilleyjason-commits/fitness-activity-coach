import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '~/context/AuthContext';
import { getSupplementLogs, setSupplementTaken } from '~/lib/db';

export interface SupplementToggleError {
  /** The state the failed toggle was trying to reach — retry re-attempts it. */
  taken: boolean;
  message: string;
}

export interface UseSupplementDayResult {
  /** Supplement ids marked taken for the date. */
  takenIds: Set<string>;
  /** Supplement ids with a save in flight. */
  savingIds: Set<string>;
  /** Per-item toggle failures, keyed by supplement id. */
  errors: Map<string, SupplementToggleError>;
  loading: boolean;
  error: string | null;
  /** Optimistic toggle through the RPC; reverts on failure. Resolves true on success. */
  toggle: (supplementId: string, taken: boolean) => Promise<boolean>;
  reload: () => Promise<void>;
}

/** Taken/untaken state for one date, saved instantly through set_supplement_taken. */
export function useSupplementDay(date: string): UseSupplementDayResult {
  const { user } = useAuth();
  const activeContext = useRef({ userId: user?.id ?? null, date });
  activeContext.current = { userId: user?.id ?? null, date };
  const [takenIds, setTakenIds] = useState<Set<string>>(new Set());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Map<string, SupplementToggleError>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const requestedUserId = user?.id ?? null;
    const requestedDate = date;
    const isCurrentContext = () =>
      activeContext.current.userId === requestedUserId &&
      activeContext.current.date === requestedDate;

    if (!user) {
      if (isCurrentContext()) {
        setTakenIds(new Set());
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await getSupplementLogs(user.id, requestedDate);
      if (isCurrentContext()) {
        setTakenIds(new Set(rows.map((row) => row.supplement_id)));
      }
    } catch (e) {
      if (isCurrentContext()) {
        setError(e instanceof Error ? e.message : 'Failed to load supplement log');
      }
    } finally {
      if (isCurrentContext()) setLoading(false);
    }
  }, [user, date]);

  useEffect(() => {
    setErrors(new Map());
    void reload();
  }, [reload]);

  const setTaken = useCallback((supplementId: string, taken: boolean) => {
    setTakenIds((current) => {
      const next = new Set(current);
      if (taken) next.add(supplementId);
      else next.delete(supplementId);
      return next;
    });
  }, []);

  const toggle = useCallback(
    async (supplementId: string, taken: boolean): Promise<boolean> => {
      const requestedUserId = user?.id ?? null;
      const requestedDate = date;
      const isCurrentContext = () =>
        activeContext.current.userId === requestedUserId &&
        activeContext.current.date === requestedDate;

      setErrors((current) => {
        if (!current.has(supplementId)) return current;
        const next = new Map(current);
        next.delete(supplementId);
        return next;
      });
      setSavingIds((current) => new Set(current).add(supplementId));
      setTaken(supplementId, taken);
      try {
        await setSupplementTaken(supplementId, requestedDate, taken);
        return true;
      } catch (e) {
        if (isCurrentContext()) {
          setTaken(supplementId, !taken);
          setErrors((current) =>
            new Map(current).set(supplementId, {
              taken,
              message: e instanceof Error ? e.message : 'Failed to save',
            }),
          );
        }
        return false;
      } finally {
        setSavingIds((current) => {
          const next = new Set(current);
          next.delete(supplementId);
          return next;
        });
      }
    },
    [date, setTaken, user?.id],
  );

  return { takenIds, savingIds, errors, loading, error, toggle, reload };
}
