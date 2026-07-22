import { useEffect, useState } from 'react';
import { Check, Pause, Play, RotateCcw, X } from 'lucide-react';
import {
  applyDuration,
  createTimer,
  isFinished,
  pauseTimer,
  remainingSeconds,
  resetTimer,
  startTimer,
} from '~/lib/rest-timer';

const PRESETS = [30, 60, 90, 120, 180];

function fmt(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Rest is over: buzz the phone and try a short beep. Both are best-effort —
 * a face-down phone in a gym must never crash the timer because an alert
 * channel is unsupported or blocked.
 */
function notifyRestFinished(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([200, 100, 200]);
    }
  } catch {
    // Vibration is an enhancement only.
  }
  try {
    const AudioCtor =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    const ctx = new AudioCtor();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.value = 0.08;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.35);
    oscillator.onended = () => {
      void ctx.close();
    };
  } catch {
    // Audio may be blocked before a user gesture; the visual state still shows.
  }
}

interface RestTimerProps {
  /** Bump to (re)start the countdown automatically after a set is logged. */
  autoStartKey?: number;
  initialSeconds?: number;
  onClose?: () => void;
  onSaveDefault?: (seconds: number) => void;
}

/** Bottom-sheet rest countdown between sets: ready → running → finished (stays until closed). */
export function RestTimer({ autoStartKey, initialSeconds = 90, onClose, onSaveDefault }: RestTimerProps) {
  const [timer, setTimer] = useState(() => createTimer(initialSeconds));
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [finished, setFinished] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const totalSeconds = timer.totalSeconds;
  const secondsLeft = remainingSeconds(timer, nowMs);
  const running = timer.running;

  // Auto-start when a set is logged (parent bumps autoStartKey).
  useEffect(() => {
    if (autoStartKey === undefined) return;
    const now = Date.now();
    setNowMs(now);
    setTimer(startTimer(createTimer(initialSeconds), now));
    setFinished(false);
  }, [autoStartKey, initialSeconds]);

  // Refresh the display while running. Remaining time is calculated from the
  // absolute deadline, so background throttling/phone lock cannot extend rest.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 250);
    return () => window.clearInterval(id);
  }, [running]);

  // The finished state stays on screen until the user closes the sheet or
  // logs the next set (autoStartKey restarts the countdown) — no auto-dismiss.
  useEffect(() => {
    if (running && isFinished(timer, nowMs)) {
      setTimer((current) => pauseTimer(current, nowMs));
      setFinished(true);
      notifyRestFinished();
    }
  }, [nowMs, running, timer]);

  function applyPreset(seconds: number) {
    const now = Date.now();
    setNowMs(now);
    setTimer((current) => applyDuration(current, seconds, now));
    setFinished(false);
    setSaveMessage('');
  }

  const progress = totalSeconds > 0 ? secondsLeft / totalSeconds : 0;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-24"
      role="dialog"
      aria-label="Rest timer"
    >
      <div className="card w-full max-w-md shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Rest Timer
          </h3>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close rest timer"
              className="-m-2 flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="mb-3 flex items-center justify-center">
          <div
            className="flex h-28 w-28 items-center justify-center rounded-full"
            style={{
              background: `conic-gradient(#10b981 ${progress * 360}deg, rgba(148, 163, 184, 0.25) 0deg)`,
            }}
            role="progressbar"
            aria-valuenow={secondsLeft}
            aria-valuemin={0}
            aria-valuemax={totalSeconds}
            aria-label="Rest time remaining"
          >
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white dark:bg-slate-800">
              {finished ? (
                <span
                  role="status"
                  aria-live="assertive"
                  className="flex animate-pulse flex-col items-center text-emerald-500"
                >
                  <Check className="h-6 w-6" aria-hidden />
                  <span className="text-xs font-semibold">Rest complete</span>
                </span>
              ) : (
                <span className="text-2xl font-bold tabular-nums">{fmt(secondsLeft)}</span>
              )}
            </div>
          </div>
        </div>

        {!finished && !running && secondsLeft === totalSeconds && (
          <p className="mb-2 text-center text-xs text-slate-500 dark:text-slate-400">Ready</p>
        )}

        <div className="mb-3 flex justify-center gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => applyPreset(preset)}
              className="min-h-11 rounded-full bg-slate-200 px-3 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
            >
              {preset < 60 ? `${preset}s` : `${preset / 60}m`}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {running ? (
            <button
              type="button"
              onClick={() => {
                const now = Date.now();
                setNowMs(now);
                setTimer((current) => pauseTimer(current, now));
              }}
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 text-sm font-semibold text-white transition-colors hover:bg-amber-600"
            >
              <Pause className="h-4 w-4" />
              Pause
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                const now = Date.now();
                setNowMs(now);
                setFinished(false);
                setTimer((current) => startTimer(current, now));
              }}
              disabled={secondsLeft === 0}
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              Start
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setTimer((current) => resetTimer(current));
              setNowMs(Date.now());
              setFinished(false);
            }}
            className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl bg-slate-200 px-4 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
            aria-label="Reset timer"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          {onSaveDefault && (
            <button
              type="button"
              onClick={() => {
                onSaveDefault(totalSeconds);
                setSaveMessage('Saved');
              }}
              className="min-h-11 rounded-xl bg-slate-200 px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
            >
              {saveMessage || 'Save default'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
