import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { useDailyLog } from '~/hooks/useDailyLog';
import { ENERGY_EMOJIS, HUNGER_EMOJIS, STRESS_EMOJIS } from '~/lib/constants';
import type { DailyLog } from '~/lib/types';
import { PageHeader } from '~/components/PageHeader';
import { EmojiScale } from '~/components/EmojiScale';

export default function LogSubjective() {
  const navigate = useNavigate();
  const today = format(new Date(), 'yyyy-MM-dd');
  const { log, loading, saving, error, save } = useDailyLog(today);

  const [energy, setEnergy] = useState<number | null>(null);
  const [stress, setStress] = useState<number | null>(null);
  const [hunger, setHunger] = useState<number | null>(null);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!log) return;
    setEnergy(log.energy_score);
    setStress(log.stress_score);
    setHunger(log.hunger_score);
    setNotes(log.notes ?? '');
  }, [log]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const patch: Partial<DailyLog> = {
      energy_score: energy,
      stress_score: stress,
      hunger_score: hunger,
      notes: notes.trim() || null,
    };
    const saved = await save(patch);
    if (saved) navigate('/');
  }

  return (
    <form onSubmit={handleSubmit}>
      <PageHeader
        title="How are you feeling?"
        subtitle={format(new Date(), 'EEEE, MMMM d')}
        backTo="/"
      />

      <div className="card mb-4 space-y-5">
        <EmojiScale
          label="Energy"
          emojis={ENERGY_EMOJIS}
          value={energy}
          onChange={setEnergy}
          captions={['Drained', 'Wired']}
        />
        <EmojiScale
          label="Stress"
          emojis={STRESS_EMOJIS}
          value={stress}
          onChange={setStress}
          captions={['Calm', 'Overwhelmed']}
        />
        <EmojiScale
          label="Hunger"
          emojis={HUNGER_EMOJIS}
          value={hunger}
          onChange={setHunger}
          captions={['Satisfied', 'Ravenous']}
        />
      </div>

      <div className="mb-4">
        <label htmlFor="notes" className="label">
          Notes
        </label>
        <textarea
          id="notes"
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything worth remembering about today…"
          className="field resize-none"
        />
      </div>

      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      <button type="submit" disabled={saving || loading} className="btn-primary">
        {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        Save check-in
      </button>
    </form>
  );
}
