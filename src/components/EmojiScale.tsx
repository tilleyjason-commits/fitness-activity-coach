interface EmojiScaleProps {
  label: string;
  /** One emoji per step, low â†’ high (length defines the scale, normally 5). */
  emojis: string[];
  /** Current 1-based value, or null when unanswered. */
  value: number | null;
  onChange: (value: number) => void;
  /** Captions under the first and last steps, e.g. ['Drained', 'Wired']. */
  captions?: [string, string];
}

/** 1â€“5 tap selector with emojis, thumb-sized targets for a 390px screen. */
export function EmojiScale({ label, emojis, value, onChange, captions }: EmojiScaleProps) {
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="flex items-center justify-between gap-2" role="radiogroup" aria-label={label}>
        {emojis.map((emoji, index) => {
          const step = index + 1;
          const selected = value === step;
          return (
            <button
              key={step}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${label} ${step} of ${emojis.length}`}
              onClick={() => onChange(step)}
              className={`flex h-14 flex-1 items-center justify-center rounded-xl text-2xl transition-all ${
                selected
                  ? 'scale-105 bg-emerald-500/15 ring-2 ring-emerald-500'
                  : 'bg-slate-200/70 opacity-70 hover:opacity-100 dark:bg-slate-700/60'
              }`}
            >
              <span aria-hidden>{emoji}</span>
            </button>
          );
        })}
      </div>
      {captions && (
        <div className="mt-1 flex justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>{captions[0]}</span>
          <span>{captions[1]}</span>
        </div>
      )}
    </fieldset>
  );
}
