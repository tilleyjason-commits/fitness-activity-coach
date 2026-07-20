import { useEffect, useState } from 'react';
import { Check, Pause, Play, RotateCcw, X } from 'lucide-react';

const PRESETS = [30, 60, 90, 120, 180];

function fmt(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

interface RestTimerProps {
  /** Bump to (re)start the countdown automatically after a set is logged. */
  autoStartKey?: number;
  initialSeconds?: number;
  onClose?: () => void;
  onSaveDefault?: (seconds: number) => void;
}

/** Bottom-sheet rest countdown between sets: ready → running → finished (auto-dismiss). */
export function RestTimer({ autoStartKey, initialSeconds = 90, onClose, onSaveDefault }: RestTimerProps) {
  const [totalSeconds, setTotalSeconds] = useState(initialSeconds);
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // Auto-start when a set is logged (parent bumps autoStartKey).
  useEffect(() => {
    if (autoStartKey === undefined) return;
    setTotalSeconds(initialSeconds);
    setSecondsLeft(initialSeconds);
    setFinished(false);
    setRunning(true);
  }, [autoStartKey, initialSeconds]);

  // 1-second tick while running; interval cleaned up on pause/unmount.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (secondsLeft === 0 && running) {
      setRunning(false);
      setFinished(true);
    }
  }, [secondsLeft, running]);

  // Finished state auto-dismisses after 3 seconds.
  useEffect(() => {
    if (!finished || !onClose) return;
    const id = window.setTimeout(onClose, 3000);
    return () => window.clearTimeout(id);
  }, [finished, onClose]);

  function applyPreset(seconds: number) {
    setTotalSeconds(seconds);
    setSecondsLeft(seconds);
    setFinished(false);
    setSaveMessage('');
    setRunning(true);
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
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700"
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
                <span className="flex animate-pulse flex-col items-center text-emerald-500">
                  <Check className="h-6 w-6" />
                  <span className="text-xs font-semibold">Done!</span>
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
              className="rounded-full bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
            >
              {preset < 60 ? `${preset}s` : `${preset / 60}m`}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {running ? (
            <button
              type="button"
              onClick={() => setRunning(false)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600"
            >
              <Pause className="h-4 w-4" />
              Pause
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setFinished(false);
                setRunning(true);
              }}
              disabled={secondsLeft === 0}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              Start
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setRunning(false);
              setFinished(false);
              setSecondsLeft(totalSeconds);
            }}
            className="flex items-center justify-center gap-2 rounded-xl bg-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
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
              className="rounded-xl bg-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
            >
              {saveMessage || 'Save default'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
