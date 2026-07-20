import { useState, type FormEvent } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { UNIT_SUGGESTIONS } from '~/lib/supplements';
import type { UserSupplement } from '~/lib/types';

export interface SupplementFormFields {
  name: string;
  dose_amount: number | null;
  dose_unit: string | null;
  instructions: string | null;
}

interface SupplementEditorProps {
  /** Present in edit mode; absent in add mode. */
  supplement?: UserSupplement | null;
  /** Rejections surface as an inline editor error. */
  onSave: (fields: SupplementFormFields) => Promise<void>;
  onCancel: () => void;
  /** Edit mode only: hard delete, guarded by an explicit confirmation. */
  onDelete?: () => Promise<void>;
}

/**
 * Inline add/edit form. Dose, unit, and instructions are optional and entirely
 * user-entered — the editor never suggests amounts. Hard delete requires a
 * second, explicit confirmation that spells out what is removed.
 */
export function SupplementEditor({ supplement, onSave, onCancel, onDelete }: SupplementEditorProps) {
  const [name, setName] = useState(supplement?.name ?? '');
  const [doseAmount, setDoseAmount] = useState(
    supplement?.dose_amount != null ? String(supplement.dose_amount) : '',
  );
  const [doseUnit, setDoseUnit] = useState(supplement?.dose_unit ?? '');
  const [instructions, setInstructions] = useState(supplement?.instructions ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError('Name is required.');
      return;
    }
    let amount: number | null = null;
    if (doseAmount.trim() !== '') {
      amount = Number(doseAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        setFormError('Dose amount must be greater than 0.');
        return;
      }
    }
    setFormError(null);
    setBusy(true);
    try {
      await onSave({
        name: trimmedName,
        dose_amount: amount,
        dose_unit: doseUnit.trim() || null,
        instructions: instructions.trim() || null,
      });
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save supplement');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    setBusy(true);
    try {
      await onDelete();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to delete supplement');
      setConfirmingDelete(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    // noValidate: validation errors surface in the accessible alert below
    // instead of native bubbles, which screen readers announce unreliably.
    <form onSubmit={handleSubmit} noValidate className="card mb-4 space-y-4">
      <div>
        <label htmlFor="supplement-name" className="label">
          Name
        </label>
        <input
          id="supplement-name"
          type="text"
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Creatine"
          className="field"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="supplement-dose" className="label">
            Dose amount
          </label>
          <input
            id="supplement-dose"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={doseAmount}
            onChange={(e) => setDoseAmount(e.target.value)}
            placeholder="optional"
            className="field"
          />
        </div>
        <div>
          <label htmlFor="supplement-unit" className="label">
            Unit
          </label>
          <input
            id="supplement-unit"
            type="text"
            maxLength={20}
            list="supplement-unit-suggestions"
            value={doseUnit}
            onChange={(e) => setDoseUnit(e.target.value)}
            placeholder="optional"
            className="field"
          />
          <datalist id="supplement-unit-suggestions">
            {UNIT_SUGGESTIONS.map((unit) => (
              <option key={unit} value={unit} />
            ))}
          </datalist>
        </div>
      </div>
      <div>
        <label htmlFor="supplement-instructions" className="label">
          Instructions
        </label>
        <input
          id="supplement-instructions"
          type="text"
          maxLength={200}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="e.g. with breakfast, before bed"
          className="field"
        />
      </div>

      {formError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {formError}
        </p>
      )}

      <div className="flex gap-3">
        <button type="submit" disabled={busy} className="btn-primary">
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="w-full rounded-xl border border-slate-300 py-3 text-base font-semibold text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          Cancel
        </button>
      </div>

      {supplement && onDelete && !confirmingDelete && (
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-300 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 dark:border-red-500/40 dark:text-red-400 dark:hover:bg-red-500/10"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          Delete
        </button>
      )}

      {supplement && onDelete && confirmingDelete && (
        <div
          role="alertdialog"
          aria-label={`Delete ${supplement.name}?`}
          className="rounded-xl border border-red-300 bg-red-50 p-3 dark:border-red-500/40 dark:bg-red-900/20"
        >
          <p className="mb-3 text-sm text-red-700 dark:text-red-300">
            Delete {supplement.name} and its check-in history? This removes its check-ins from the
            supplement log. Past daily-log records are kept.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              Delete {supplement.name}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={busy}
              className="w-full rounded-xl border border-slate-300 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Keep
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
