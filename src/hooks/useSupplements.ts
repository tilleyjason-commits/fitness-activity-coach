import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '~/context/AuthContext';
import { addSupplement, deleteSupplement, listSupplements, updateSupplement } from '~/lib/db';
import { compareSupplements } from '~/lib/supplements';
import type { UserSupplement, UserSupplementInsert } from '~/lib/types';

export type SupplementPatch = Partial<
  Pick<
    UserSupplement,
    'name' | 'dose_amount' | 'dose_unit' | 'instructions' | 'active' | 'sort_order'
  >
>;

export interface UseSupplementsResult {
  supplements: UserSupplement[];
  loading: boolean;
  error: string | null;
  /** Insert for the current user; rejects on failure (callers show inline errors). */
  add: (input: Omit<UserSupplementInsert, 'user_id'>) => Promise<UserSupplement>;
  update: (id: string, patch: SupplementPatch) => Promise<UserSupplement>;
  remove: (id: string) => Promise<void>;
  reload: () => Promise<void>;
}

/**
 * The current user's supplement list. Never seeds defaults: an empty list
 * stays empty until the user explicitly adds built-ins or custom entries.
 */
export function useSupplements(): UseSupplementsResult {
  const { user } = useAuth();
  const [supplements, setSupplements] = useState<UserSupplement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!user) {
      setSupplements([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setSupplements(await listSupplements(user.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load supplements');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const add = useCallback(
    async (input: Omit<UserSupplementInsert, 'user_id'>): Promise<UserSupplement> => {
      if (!user) throw new Error('Not signed in');
      const created = await addSupplement({ ...input, user_id: user.id });
      setSupplements((current) => [...current, created].sort(compareSupplements));
      return created;
    },
    [user],
  );

  const update = useCallback(
    async (id: string, patch: SupplementPatch): Promise<UserSupplement> => {
      const updated = await updateSupplement(id, patch);
      setSupplements((current) =>
        current.map((s) => (s.id === id ? updated : s)).sort(compareSupplements),
      );
      return updated;
    },
    [],
  );

  const remove = useCallback(async (id: string): Promise<void> => {
    await deleteSupplement(id);
    setSupplements((current) => current.filter((s) => s.id !== id));
  }, []);

  return { supplements, loading, error, add, update, remove, reload };
}
