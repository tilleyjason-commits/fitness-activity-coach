/**
 * Remembers which exercises of today's workout already received the
 * previous-session prefill, so a remount (app switch, reload) never re-applies
 * it over values the user has since adjusted. Keyed per user and date.
 */
const PREFIX = 'fac-prefilled-v1:';

function key(userId: string, date: string): string {
  return `${PREFIX}${userId}:${date}`;
}

export function readPrefilledExerciseIds(userId: string, date: string): Set<string> {
  try {
    const raw = localStorage.getItem(key(userId, date));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

export function markExercisesPrefilled(userId: string, date: string, ids: Iterable<string>): void {
  try {
    const merged = new Set([...readPrefilledExerciseIds(userId, date), ...ids]);
    localStorage.setItem(key(userId, date), JSON.stringify([...merged]));
  } catch {
    // Storage failures must never block logging.
  }
}

export function clearPrefilledExercises(userId: string, date: string): void {
  try {
    localStorage.removeItem(key(userId, date));
  } catch {
    // Ignore storage failures on cleanup.
  }
}
