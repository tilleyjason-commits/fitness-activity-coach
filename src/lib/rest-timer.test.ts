import { describe, expect, it } from 'vitest';
import {
  applyDuration,
  createTimer,
  isFinished,
  pauseTimer,
  remainingSeconds,
  resetTimer,
  startTimer,
} from '~/lib/rest-timer';

/**
 * The rest timer must measure wall-clock elapsed time, not interval ticks:
 * when the phone locks or the browser throttles timers, the countdown still
 * ends at the right moment instead of being silently extended.
 */

const T0 = 1_700_000_000_000; // arbitrary fixed epoch ms

describe('wall-clock rest timer', () => {
  it('counts down using wall-clock time', () => {
    const t = startTimer(createTimer(90), T0);
    expect(remainingSeconds(t, T0)).toBe(90);
    expect(remainingSeconds(t, T0 + 30_000)).toBe(60);
    expect(remainingSeconds(t, T0 + 89_500)).toBe(1);
  });

  it('is unaffected by missing ticks (background throttling / phone lock)', () => {
    const t = startTimer(createTimer(90), T0);
    // No ticks fired for 2 minutes; the timer must read 0, not "90 minus a few".
    expect(remainingSeconds(t, T0 + 120_000)).toBe(0);
    expect(isFinished(t, T0 + 120_000)).toBe(true);
    expect(isFinished(t, T0 + 89_000)).toBe(false);
  });

  it('pauses by freezing the remaining time', () => {
    const started = startTimer(createTimer(90), T0);
    const paused = pauseTimer(started, T0 + 30_000);
    expect(paused.running).toBe(false);
    // Frozen: however much later we look, remaining stays 60.
    expect(remainingSeconds(paused, T0 + 30_000)).toBe(60);
    expect(remainingSeconds(paused, T0 + 500_000)).toBe(60);
  });

  it('resumes from the paused remainder against a new deadline', () => {
    const paused = pauseTimer(startTimer(createTimer(90), T0), T0 + 30_000);
    const resumed = startTimer(paused, T0 + 100_000);
    expect(remainingSeconds(resumed, T0 + 100_000)).toBe(60);
    expect(remainingSeconds(resumed, T0 + 130_000)).toBe(30);
    expect(isFinished(resumed, T0 + 160_000)).toBe(true);
  });

  it('reset returns to the full duration, stopped', () => {
    const t = resetTimer(startTimer(createTimer(90), T0));
    expect(t.running).toBe(false);
    expect(remainingSeconds(t, T0 + 999_999)).toBe(90);
  });

  it('applyDuration switches presets and restarts from the new duration', () => {
    const t = applyDuration(startTimer(createTimer(90), T0), 120, T0 + 10_000);
    expect(t.totalSeconds).toBe(120);
    expect(t.running).toBe(true);
    expect(remainingSeconds(t, T0 + 10_000)).toBe(120);
    expect(remainingSeconds(t, T0 + 70_000)).toBe(60);
  });

  it('never returns negative remaining time', () => {
    const t = startTimer(createTimer(30), T0);
    expect(remainingSeconds(t, T0 + 999_999)).toBe(0);
  });
});
