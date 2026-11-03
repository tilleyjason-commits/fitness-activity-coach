import { useRef, useState, type FormEvent } from 'react';
import { format } from 'date-fns';
import { Camera, Loader2, Trash2, X } from 'lucide-react';
import { useFocusTrap } from '~/hooks/useFocusTrap';
import {
  deleteProgressPhoto,
  listMeasurements,
  listPhotos,
  PHOTO_MAX_BYTES,
  saveMeasurement,
  uploadProgressPhoto,
  validatePhotoFile,
  type BodyMeasurement,
  type ProgressPhoto,
} from '~/lib/plan-repo';

const FIELDS = [
  { key: 'chestIn', label: 'Chest' },
  { key: 'armIn', label: 'Arm' },
  { key: 'thighIn', label: 'Thigh' },
  { key: 'hipIn', label: 'Hip' },
  { key: 'neckIn', label: 'Neck' },
  { key: 'calfIn', label: 'Calf' },
] as const;
type FieldKey = (typeof FIELDS)[number]['key'];

/** Blank -> null; otherwise a sane inch value or NaN (rejected by the caller). */
function parseInches(raw: string): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= 200 ? n : Number.NaN;
}

function PhotoViewer({
  photo,
  onClose,
  onDeleted,
}: {
  photo: ProgressPhoto;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useFocusTrap(ref, true, onClose);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await deleteProgressPhoto(photo);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the photo.');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={`Progress photo from ${photo.takenOn}`}
        tabIndex={-1}
        className="card flex max-h-full w-full max-w-md flex-col gap-3 overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{photo.takenOn}</h3>
          <button type="button" onClick={onClose} aria-label="Close photo" className="flex h-11 w-11 items-center justify-center rounded-full">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        {photo.url && <img src={photo.url} alt={photo.caption || `Progress photo ${photo.takenOn}`} className="max-h-[60vh] w-full rounded-xl object-contain" />}
        {photo.caption && <p className="text-sm text-slate-600 dark:text-slate-300">{photo.caption}</p>}
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {confirming ? (
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={remove} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Delete permanently
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="min-h-11 flex-1 rounded-xl border border-slate-300 px-4 text-sm font-semibold dark:border-slate-600">
              Keep
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-red-700 dark:border-slate-600 dark:text-red-400">
            <Trash2 className="h-4 w-4" aria-hidden />
            Delete photo
          </button>
        )}
      </div>
    </div>
  );
}

export function BodyProgress({
  userId,
  goal,
  measurements,
  photos,
  onMeasurements,
  onPhotos,
}: {
  userId: string;
  goal: number | null;
  measurements: BodyMeasurement[];
  photos: ProgressPhoto[];
  onMeasurements: (rows: BodyMeasurement[]) => void;
  onPhotos: (rows: ProgressPhoto[]) => void;
}) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [date, setDate] = useState(today);
  const [values, setValues] = useState<Record<FieldKey, string>>({
    chestIn: '', armIn: '', thighIn: '', hipIn: '', neckIn: '', calfIn: '',
  });
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [measureError, setMeasureError] = useState<string | null>(null);
  const [measureSaved, setMeasureSaved] = useState(false);

  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ProgressPhoto | null>(null);

  async function submitMeasurement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMeasureError(null);
    setMeasureSaved(false);
    const parsed = FIELDS.map(({ key }) => [key, parseInches(values[key])] as const);
    if (parsed.some(([, v]) => Number.isNaN(v))) {
      setMeasureError('Enter measurements as inches between 0 and 200, or leave a field blank.');
      return;
    }
    if (parsed.every(([, v]) => v === null)) {
      setMeasureError('Enter at least one measurement.');
      return;
    }
    setSaving(true);
    try {
      await saveMeasurement(userId, {
        measuredOn: date,
        ...(Object.fromEntries(parsed) as Record<FieldKey, number | null>),
        notes: notes.trim(),
      });
      onMeasurements(await listMeasurements());
      setValues({ chestIn: '', armIn: '', thighIn: '', hipIn: '', neckIn: '', calfIn: '' });
      setNotes('');
      setMeasureSaved(true);
    } catch (e) {
      setMeasureError(e instanceof Error ? e.message : 'Could not save the measurement.');
    } finally {
      setSaving(false);
    }
  }

  async function onFile(file: File | undefined, input: HTMLInputElement) {
    if (!file) return;
    setPhotoError(null);
    const invalid = validatePhotoFile(file);
    if (invalid) {
      setPhotoError(invalid);
      input.value = '';
      return;
    }
    setUploading(true);
    try {
      await uploadProgressPhoto(userId, file, today, caption.trim());
      setCaption('');
      onPhotos(await listPhotos());
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : 'Could not upload the photo.');
    } finally {
      setUploading(false);
      input.value = '';
    }
  }

  return (
    <div className="space-y-4">
      <section className="card">
        <h2 className="section-title">Goal</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {goal === null
            ? 'Set a goal weight in More to draw the line on the weight chart.'
            : `Goal weight: ${goal} lb. The week chart draws this as a line.`}
        </p>
      </section>

      <section className="card" aria-label="Body measurements">
        <h2 className="section-title">Measurements</h2>
        <form onSubmit={submitMeasurement} className="space-y-3">
          <div>
            <label htmlFor="measure-date" className="label">Date</label>
            <input id="measure-date" type="date" required max={today} value={date} onChange={(e) => setDate(e.target.value)} className="field" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map(({ key, label }) => (
              <div key={key}>
                <label htmlFor={`measure-${key}`} className="label">{label} (in)</label>
                <input
                  id={`measure-${key}`}
                  className="field"
                  inputMode="decimal"
                  autoComplete="off"
                  value={values[key]}
                  onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div>
            <label htmlFor="measure-notes" className="label">Note</label>
            <input id="measure-notes" className="field" maxLength={200} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {measureError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{measureError}</p>}
          {measureSaved && !measureError && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">Measurement saved.</p>}
          <button type="submit" disabled={saving} className="btn-primary">
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Save measurement
          </button>
        </form>

        <h3 className="mt-5 text-sm font-semibold">History</h3>
        {measurements.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">No measurements yet. Your first entry will show up here.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-200 dark:divide-slate-700">
            {measurements.map((row) => {
              const filled = FIELDS.filter(({ key }) => row[key] !== null);
              return (
                <li key={row.id} className="py-2">
                  <p className="text-sm font-semibold">{row.measuredOn}</p>
                  <p className="mt-1 flex flex-wrap gap-1.5">
                    {filled.map(({ key, label }) => (
                      <span key={key} className="chip">{label} {row[key]} in</span>
                    ))}
                  </p>
                  {row.notes && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{row.notes}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card" aria-label="Progress photos">
        <h2 className="section-title">Photos</h2>
        <div className="space-y-3">
          <div>
            <label htmlFor="photo-caption" className="label">Caption (optional)</label>
            <input id="photo-caption" className="field" maxLength={140} value={caption} onChange={(e) => setCaption(e.target.value)} />
          </div>
          <label className={`btn-primary cursor-pointer ${uploading ? 'opacity-50' : ''}`}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Camera className="h-4 w-4" aria-hidden />}
            {uploading ? 'Uploading…' : 'Add photo'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Progress photo"
              disabled={uploading}
              className="sr-only"
              onChange={(event) => void onFile(event.target.files?.[0], event.target)}
            />
          </label>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            JPEG, PNG, or WebP, up to {PHOTO_MAX_BYTES / (1024 * 1024)} MB. Photos are private to your account.
          </p>
          {photoError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{photoError}</p>}
        </div>

        {photos.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No photos yet. Take one in similar lighting each time to compare.</p>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-2">
            {photos.map((photo) => (
              <li key={photo.id}>
                <button type="button" onClick={() => setViewing(photo)} className="block w-full text-left" aria-label={`Open photo from ${photo.takenOn}`}>
                  {photo.url ? (
                    <img src={photo.url} alt="" loading="lazy" className="aspect-[3/4] w-full rounded-xl object-cover" />
                  ) : (
                    <div className="flex aspect-[3/4] w-full items-center justify-center rounded-xl bg-slate-200 text-xs text-slate-500 dark:bg-slate-700">Unavailable</div>
                  )}
                  <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{photo.takenOn}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {viewing && (
        <PhotoViewer
          photo={viewing}
          onClose={() => setViewing(null)}
          onDeleted={() => {
            onPhotos(photos.filter((p) => p.id !== viewing.id));
            setViewing(null);
          }}
        />
      )}
    </div>
  );
}
