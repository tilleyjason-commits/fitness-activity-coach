/**
 * Single-flight, coalescing autosave controller.
 *
 * Guarantees:
 *  - At most one save is in flight at any time.
 *  - The newest scheduled snapshot wins; intermediate snapshots are coalesced.
 *  - A stale completion can never overwrite newer state or falsely report
 *    "saved" while newer edits are still pending.
 *  - Failures surface as a retryable 'error' state; the controller performs
 *    NO automatic retries of its own. The save function is injected, so a
 *    later offline queue can wrap it (persist + replay) without this
 *    controller recursively enqueueing retries on top of the queue's.
 */

export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface AutosaveState {
  status: AutosaveStatus;
  error: string | null;
}

export interface AutosaveController<T> {
  /** Queue a snapshot (debounced). The newest snapshot supersedes older ones. */
  schedule(snapshot: T): void;
  /**
   * Save any outstanding snapshot immediately and settle once nothing is
   * pending or in flight. Rejects if the final state is 'error', so callers
   * (e.g. "Finish workout") cannot proceed on unsaved state.
   */
  flush(): Promise<void>;
  /** Re-attempt the last failed snapshot (no-op unless in the error state). */
  retry(): void;
  getState(): AutosaveState;
  subscribe(listener: (state: AutosaveState) => void): () => void;
  /** Cancel pending work and mute late completions (component unmount). */
  dispose(): void;
}

export function createAutosaveController<T>(
  save: (snapshot: T) => Promise<void>,
  options: { debounceMs?: number } = {},
): AutosaveController<T> {
  const debounceMs = options.debounceMs ?? 1200;

  let pending: { snapshot: T } | null = null;
  let lastFailed: { snapshot: T } | null = null;
  let inFlight = false;
  let disposed = false;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let state: AutosaveState = { status: 'idle', error: null };
  const listeners = new Set<(s: AutosaveState) => void>();
  let drainWaiters: { resolve: () => void; reject: (e: Error) => void }[] = [];

  function setState(next: AutosaveState) {
    if (disposed) return;
    if (next.status === state.status && next.error === state.error) return;
    state = next;
    listeners.forEach((listener) => listener(state));
  }

  function settleDrain() {
    if (inFlight || pending) return;
    const waiters = drainWaiters;
    drainWaiters = [];
    if (state.status === 'error') {
      const err = new Error(state.error ?? 'Autosave failed');
      waiters.forEach((w) => w.reject(err));
    } else {
      waiters.forEach((w) => w.resolve());
    }
  }

  function clearTimer() {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  function startSave() {
    if (disposed || inFlight || !pending) return;
    clearTimer();
    const { snapshot } = pending;
    pending = null;
    inFlight = true;
    setState({ status: 'saving', error: null });
    save(snapshot).then(
      () => {
        if (disposed) return;
        inFlight = false;
        lastFailed = null;
        if (pending) {
          // Newer edits arrived while saving: this completion is stale, so it
          // must not claim "saved" — save the newer snapshot instead.
          startSave();
        } else {
          setState({ status: 'saved', error: null });
          settleDrain();
        }
      },
      (e: unknown) => {
        if (disposed) return;
        inFlight = false;
        if (pending) {
          // A newer snapshot supersedes the failed one.
          startSave();
        } else {
          lastFailed = { snapshot };
          setState({
            status: 'error',
            error: e instanceof Error ? e.message : 'Autosave failed',
          });
          settleDrain();
        }
      },
    );
  }

  return {
    schedule(snapshot: T) {
      if (disposed) return;
      pending = { snapshot };
      lastFailed = null;
      setState({ status: 'pending', error: null });
      if (!inFlight) {
        clearTimer();
        timerId = setTimeout(() => {
          timerId = null;
          startSave();
        }, debounceMs);
      }
      // While a save is in flight its completion callback picks this up.
    },
    flush() {
      return new Promise<void>((resolve, reject) => {
        if (disposed) {
          resolve();
          return;
        }
        drainWaiters.push({ resolve, reject });
        if (pending && !inFlight) startSave();
        else if (!pending && !inFlight) settleDrain();
      });
    },
    retry() {
      if (disposed) return;
      if (pending) {
        startSave();
        return;
      }
      if (lastFailed) {
        pending = lastFailed;
        lastFailed = null;
        startSave();
      }
    },
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      disposed = true;
      clearTimer();
      listeners.clear();
      pending = null;
      drainWaiters.forEach((w) => w.resolve());
      drainWaiters = [];
    },
  };
}
