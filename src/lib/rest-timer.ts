/**
 * Pure wall-clock countdown logic for the rest timer.
 *
 * The countdown is anchored to an absolute deadline (`endAtMs`) instead of
 * decrementing on interval ticks, so browser timer throttling or a locked
 * phone can delay the *display* but never extend the actual rest period.
 * All functions are pure: the caller supplies `nowMs` (Date.now()).
 */

export interface RestTimerState {
  /** Configured duration in seconds (presets / saved default). */
  totalSeconds: number;
  running: boolean;
  /** Absolute epoch-ms deadline while running; null when stopped/paused. */
  endAtMs: number | null;
  /** Remaining seconds frozen while not running (ready/paused/reset). */
  remainingWhenStoppedSec: number;
}

export function createTimer(totalSeconds: number): RestTimerState {
  return {
    totalSeconds,
    running: false,
    endAtMs: null,
    remainingWhenStoppedSec: totalSeconds,
  };
}

/** Start (or resume from pause) against a fresh wall-clock deadline. */
export function startTimer(state: RestTimerState, nowMs: number): RestTimerState {
  if (state.running) return state;
  return {
    ...state,
    running: true,
    endAtMs: nowMs + state.remainingWhenStoppedSec * 1000,
  };
}

/** Pause by freezing however much wall-clock time actually remains. */
export function pauseTimer(state: RestTimerState, nowMs: number): RestTimerState {
  if (!state.running) return state;
  return {
    ...state,
    running: false,
    endAtMs: null,
    remainingWhenStoppedSec: remainingSeconds(state, nowMs),
  };
}

/** Back to the full configured duration, stopped. */
export function resetTimer(state: RestTimerState): RestTimerState {
  return createTimer(state.totalSeconds);
}

/** Switch duration (preset tap) and start counting immediately. */
export function applyDuration(
  state: RestTimerState,
  totalSeconds: number,
  nowMs: number,
): RestTimerState {
  void state;
  return startTimer(createTimer(totalSeconds), nowMs);
}

export function remainingSeconds(state: RestTimerState, nowMs: number): number {
  if (!state.running || state.endAtMs === null) {
    return Math.max(0, state.remainingWhenStoppedSec);
  }
  return Math.max(0, Math.ceil((state.endAtMs - nowMs) / 1000));
}

export function isFinished(state: RestTimerState, nowMs: number): boolean {
  return remainingSeconds(state, nowMs) === 0;
}
