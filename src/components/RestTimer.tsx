import { useEffect, useRef, useState } from 'react';
import { Check, Pause, Play, RotateCcw, X } from 'lucide-react';
import {
  applyDuration,
  clearPersistedTimer,
  createTimer,
  isFinished,
  loadPersistedTimer,
  pauseTimer,
  persistTimer,
  remainingSeconds,
  type RestTimerState,
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

function initialTimer(autoStartKey: number | undefined, initialSeconds: number): RestTimerState {
  // A persisted timer means this mount is restoring state after a remount
  // (token refresh) or a discarded tab (app switch). Use it as-is.
  const persisted = loadPersistedTimer();
  if (persisted) return persisted;
  return autoStartKey !== undefined
    ? startTimer(createTimer(initialSeconds), Date.now())
    : createTimer(initialSeconds);
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
  const [timer, setTimer] = useState<RestTimerState>(() => initialTimer(autoStartKey, initialSeconds));
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [finished, setFinished] = useState(() => {
    const persisted = loadPersistedTimer();
    return persisted ? remainingSeconds(persisted, Date.now()) === 0 : false;
  });
  const [saveMessage, setSaveMessage] = useState('');
  const totalSeconds = timer.totalSeconds;
  const secondsLeft = remainingSeconds(timer, nowMs);
  const running = timer.running;

  // Persist on every change so a remount or discarded-tab reload can restore
  // the wall-clock deadline. Do not clear on unmount: token-refresh remounts
  // run cleanup and would wipe the snapshot the next mount needs.
  useEffect(() => {
    persistTimer(timer);
  }, [timer]);

  useEffect(() => {
    const persistNow = () => persistTimer(timer);
    const catchUp = () => setNowMs(Date.now());
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') persistNow();
      if (document.visibilityState === 'visible') catchUp();
    };
    window.addEventListener('pagehide', persistNow);
    window.addEventListener('pageshow', catchUp);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      persistNow();
      window.removeEventListener('pagehide', persistNow);
      window.removeEventListener('pageshow', catchUp);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [timer]);

  // Auto-start when a set is logged (parent bumps autoStartKey). Skipped on
  // the very first render: the lazy initializer above already applied
  // autoStartKey (or a restored timer) for that render, so re-applying it
  // here would stomp a restored in-progress countdown right after mount.
  const isFirstRenderRef = useRef(true);
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
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
      className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-3"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 4.25rem)' }}
      role="dialog"
      aria-label="Rest timer"
    >
      {/* Docked bar, not an overlay: rest never covers the set being logged. */}
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg dark:border-slate-700/60 dark:bg-slate-800">
        <div
          className="h-1 w-full bg-slate-200 dark:bg-slate-700"
          role="progressbar"
          aria-valuenow={secondsLeft}
          aria-valuemin={0}
          aria-valuemax={totalSeconds}
          aria-label="Rest time remaining"
        >
          <div
            className="h-full bg-emerald-500 transition-[width] duration-300"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>

        <div className="flex items-center gap-2 px-3 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {finished ? (
              <span
                role="status"
                aria-live="assertive"
                className="flex items-center gap-1.5 text-emerald-500"
              >
                <Check className="h-5 w-5 shrink-0" aria-hidden />
                <span className="text-sm font-semibold">Rest complete</span>
              </span>
            ) : (
              <>
                <span className="text-2xl font-bold tabular-nums">{fmt(secondsLeft)}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {running ? 'rest' : secondsLeft === totalSeconds ? 'Ready' : 'paused'}
                </span>
              </>
            )}
          </div>

          {running ? (
            <button
              type="button"
              onClick={() => {
                const now = Date.now();
                setNowMs(now);
                setTimer((current) => pauseTimer(current, now));
              }}
              className="flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3 text-sm font-semibold text-white transition-colors hover:bg-amber-600"
            >
              <Pause className="h-4 w-4" aria-hidden />
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
              className="flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play className="h-4 w-4" aria-hidden />
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
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
            aria-label="Reset timer"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={() => {
                clearPersistedTimer();
                onClose();
              }}
              aria-label="Close rest timer"
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 border-t border-slate-200 px-3 py-1.5 dark:border-slate-700/60">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => applyPreset(preset)}
              className={`min-h-11 flex-1 rounded-lg px-2 text-xs font-medium transition-colors ${
                totalSeconds === preset
                  ? 'bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-900'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {preset < 60 ? `${preset}s` : `${preset / 60}m`}
            </button>
          ))}
          {onSaveDefault && (
            <button
              type="button"
              onClick={() => {
                onSaveDefault(totalSeconds);
                setSaveMessage('Saved');
              }}
              className="min-h-11 shrink-0 rounded-lg px-2 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
            >
              {saveMessage || 'Save default'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
