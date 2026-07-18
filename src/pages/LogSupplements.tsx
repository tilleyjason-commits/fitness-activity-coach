import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Loader2, Moon, Pill, Sun } from 'lucide-react';
import { useDailyLog } from '~/hooks/useDailyLog';
import type { DailyLog } from '~/lib/types';
import { PageHeader } from '~/components/PageHeader';
import { ToggleRow } from '~/components/ToggleRow';

export default function LogSupplements() {
  const navigate = useNavigate();
  const today = format(new Date(), 'yyyy-MM-dd');
  const { log, loading, saving, error, save } = useDailyLog(today);

  const [creatine, setCreatine] = useState(false);
  const [vitaminD, setVitaminD] = useState(false);
  const [magnesium, setMagnesium] = useState(false);

  useEffect(() => {
    if (!log) return;
    setCreatine(log.creatine_taken);
    setVitaminD(log.vitamin_d_taken);
    setMagnesium(log.magnesium_taken);
  }, [log]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const patch: Partial<DailyLog> = {
      creatine_taken: creatine,
      vitamin_d_taken: vitaminD,
      magnesium_taken: magnesium,
    };
    const saved = await save(patch);
    if (saved) navigate('/');
  }

  return (
    <form onSubmit={handleSubmit}>
      <PageHeader
        title="Log Supplements"
        subtitle={format(new Date(), 'EEEE, MMMM d')}
        backTo="/"
      />

      <div className="mb-4 space-y-3">
        <ToggleRow
          label="Creatine"
          description="5 g daily, timing doesn't matter"
          checked={creatine}
          onChange={setCreatine}
          icon={<Pill className="h-5 w-5" />}
        />
        <ToggleRow
          label="Vitamin D"
          description="With a meal containing fat"
          checked={vitaminD}
          onChange={setVitaminD}
          icon={<Sun className="h-5 w-5" />}
        />
        <ToggleRow
          label="Magnesium"
          description="Evening, supports sleep"
          checked={magnesium}
          onChange={setMagnesium}
          icon={<Moon className="h-5 w-5" />}
        />
      </div>

      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      <button type="submit" disabled={saving || loading} className="btn-primary">
        {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        Save supplements
      </button>
    </form>
  );
}
