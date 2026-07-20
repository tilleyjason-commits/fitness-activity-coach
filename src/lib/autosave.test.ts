import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutosaveController, type AutosaveState } from '~/lib/autosave';

/**
 * Single-flight coalescing autosave: at most one save in flight, the newest
 * pending snapshot wins, stale completions cannot overwrite newer state, and
 * errors stay visible and retryable. Deterministic via deferred promises and
 * fake timers.
 */

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
  reject: (e: Error) => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Let queued microtasks (then-callbacks after resolve/reject) run. */
async function drainMicrotasks() {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

describe('createAutosaveController', () => {
  let saves: { snapshot: string; d: Deferred }[];
  let save: (snapshot: string) => Promise<void>;
  let states: AutosaveState[];

  beforeEach(() => {
    vi.useFakeTimers();
    saves = [];
    save = (snapshot: string) => {
      const d = deferred();
      saves.push({ snapshot, d });
      return d.promise;
    };
    states = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeController(debounceMs = 100) {
    const controller = createAutosaveController<string>(save, { debounceMs });
    controller.subscribe((s) => states.push(s));
    return controller;
  }

  it('debounces and saves the latest snapshot', async () => {
    const controller = makeController();
    controller.schedule('v1');
    controller.schedule('v2');
    expect(saves).toHaveLength(0);
    expect(controller.getState().status).toBe('pending');

    vi.advanceTimersByTime(100);
    expect(saves).toHaveLength(1);
    expect(saves[0].snapshot).toBe('v2');
    expect(controller.getState().status).toBe('saving');

    saves[0].d.resolve();
    await drainMicrotasks();
    expect(controller.getState().status).toBe('saved');
  });

  it('keeps a single save in flight and coalesces snapshots scheduled meanwhile', async () => {
    const controller = makeController();
    controller.schedule('v1');
    vi.advanceTimersByTime(100);
    expect(saves).toHaveLength(1);

    // Two edits while v1 is still in flight — only the newest may be saved.
    controller.schedule('v2');
    controller.schedule('v3');
    vi.advanceTimersByTime(1000);
    expect(saves).toHaveLength(1); // still only v1 in flight

    saves[0].d.resolve();
    await drainMicrotasks();

    expect(saves).toHaveLength(2);
    expect(saves[1].snapshot).toBe('v3'); // v2 was coalesced away

    saves[1].d.resolve();
    await drainMicrotasks();
    expect(controller.getState().status).toBe('saved');
    expect(saves).toHaveLength(2);
  });

  it('does not report "saved" when an older save completes while newer edits are pending (stale completion)', async () => {
    const controller = makeController();
    controller.schedule('v1');
    vi.advanceTimersByTime(100);
    controller.schedule('v2');

    // v1 completes, but v2 is newer and not yet saved: claiming "saved" here would lie.
    saves[0].d.resolve();
    await drainMicrotasks();

    expect(controller.getState().status).not.toBe('saved');
    expect(saves).toHaveLength(2);
    expect(saves[1].snapshot).toBe('v2');

    saves[1].d.resolve();
    await drainMicrotasks();
    expect(controller.getState().status).toBe('saved');
  });

  it('surfaces save failures as a retryable error and retries with the failed snapshot', async () => {
    const controller = makeController();
    controller.schedule('v1');
    vi.advanceTimersByTime(100);

    saves[0].d.reject(new Error('network down'));
    await drainMicrotasks();

    expect(controller.getState().status).toBe('error');
    expect(controller.getState().error).toMatch(/network down/);

    controller.retry();
    expect(saves).toHaveLength(2);
    expect(saves[1].snapshot).toBe('v1');
    expect(controller.getState().status).toBe('saving');

    saves[1].d.resolve();
    await drainMicrotasks();
    expect(controller.getState().status).toBe('saved');
    expect(controller.getState().error).toBeNull();
  });

  it('prefers a newer snapshot over re-saving the failed one after an error', async () => {
    const controller = makeController();
    controller.schedule('v1');
    vi.advanceTimersByTime(100);
    controller.schedule('v2');

    saves[0].d.reject(new Error('boom'));
    await drainMicrotasks();

    // The newer snapshot supersedes the failed one automatically.
    expect(saves).toHaveLength(2);
    expect(saves[1].snapshot).toBe('v2');

    saves[1].d.resolve();
    await drainMicrotasks();
    expect(controller.getState().status).toBe('saved');
  });

  it('flush() saves the pending snapshot immediately and resolves when drained', async () => {
    const controller = makeController();
    controller.schedule('v1');

    const flushed = vi.fn();
    void controller.flush().then(flushed);
    await drainMicrotasks();
    expect(saves).toHaveLength(1); // no debounce wait

    saves[0].d.resolve();
    await drainMicrotasks();
    expect(flushed).toHaveBeenCalled();
    expect(controller.getState().status).toBe('saved');
  });

  it('flush() rejects when the save fails so callers cannot finish on unsaved state', async () => {
    const controller = makeController();
    controller.schedule('v1');

    const rejected = vi.fn();
    void controller.flush().catch(rejected);
    await drainMicrotasks();
    saves[0].d.reject(new Error('offline'));
    await drainMicrotasks();

    expect(rejected).toHaveBeenCalled();
    expect(controller.getState().status).toBe('error');
  });

  it('dispose() cancels pending work and mutes late completions', async () => {
    const controller = makeController();
    controller.schedule('v1');
    vi.advanceTimersByTime(100);
    controller.schedule('v2');
    controller.dispose();

    const before = states.length;
    saves[0].d.resolve();
    await drainMicrotasks();
    vi.advanceTimersByTime(10_000);

    expect(saves).toHaveLength(1); // v2 never saved after dispose
    expect(states.length).toBe(before); // no listener calls after dispose
  });
});
