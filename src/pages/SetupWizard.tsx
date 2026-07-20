import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Check, Dumbbell, Loader2 } from 'lucide-react';
import { useAuth } from '~/context/AuthContext';
import { upsertProfile } from '~/lib/db';

type Step = 1 | 2 | 3;

/** Raw input strings for every wizard field; converted to numbers on submit. */
interface SetupData {
  age: string;
  height_cm: string;
  weight_lb: string;
  bodyfat_pct: string;
  goal_bodyfat_pct: string;
  goal_weight_lb: string;
  training_years: string;
  training_time: string;
}

const EMPTY_DATA: SetupData = {
  age: '',
  height_cm: '',
  weight_lb: '',
  bodyfat_pct: '',
  goal_bodyfat_pct: '',
  goal_weight_lb: '',
  training_years: '',
  training_time: 'Morning',
};

const STEP_LABELS: Record<Step, string> = { 1: 'About You', 2: 'Stats', 3: 'Goals' };
const TRAINING_TIMES = ['Morning', 'Midday', 'Afternoon', 'Evening'];

function toNum(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}

function Stepper({ step }: { step: Step }) {
  const steps: Step[] = [1, 2, 3];
  return (
    <div className="mb-8 flex items-start justify-center">
      {steps.map((n, i) => {
        const done = step > n;
        const current = step === n;
        return (
          <div key={n} className="flex items-start">
            {i > 0 && (
              <div
                className={`mt-4 h-0.5 w-10 sm:w-14 ${
                  step > n - 1 ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                }`}
                aria-hidden
              />
            )}
            <div className="flex w-16 flex-col items-center gap-1">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                  done
                    ? 'bg-emerald-500 text-white'
                    : current
                      ? 'border-2 border-emerald-500 bg-emerald-500/10 text-emerald-500'
                      : 'border-2 border-slate-300 text-slate-400 dark:border-slate-700 dark:text-slate-500'
                }`}
                aria-current={current ? 'step' : undefined}
              >
                {done ? <Check className="h-4 w-4" aria-hidden /> : n}
              </span>
              <span
                className={`text-center text-xs font-medium ${
                  done || current
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {STEP_LABELS[n]}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface SummaryRow {
  label: string;
  value: string;
}

function summaryRows(data: SetupData): SummaryRow[] {
  const dash = '—';
  const show = (v: string, suffix = '') => (v.trim() === '' ? dash : `${v}${suffix}`);
  return [
    { label: 'Age', value: show(data.age) },
    { label: 'Height', value: show(data.height_cm, ' cm') },
    { label: 'Training experience', value: show(data.training_years, ' yr') },
    { label: 'Trains at', value: data.training_time || dash },
    { label: 'Current weight', value: show(data.weight_lb, ' lb') },
    { label: 'Body fat', value: show(data.bodyfat_pct, '%') },
    { label: 'Goal weight', value: show(data.goal_weight_lb, ' lb') },
    { label: 'Goal body fat', value: show(data.goal_bodyfat_pct, '%') },
  ];
}

/**
 * One-time onboarding wizard at /setup. Lives outside the AuthGuard (no
 * NavBar), so it checks auth itself and bounces signed-out visitors to /login.
 */
export default function SetupWizard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>(1);
  const [data, setData] = useState<SetupData>(EMPTY_DATA);
  const [errors, setErrors] = useState<Partial<Record<keyof SetupData, string>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" aria-label="Loading" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  function set(field: keyof SetupData, value: string) {
    setData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function validateStep1(): boolean {
    const next: Partial<Record<keyof SetupData, string>> = {};
    const age = toNum(data.age);
    if (age === null) next.age = 'This field is required';
    else if (Number.isNaN(age) || age < 10) next.age = 'Enter an age of 10 or older';
    const height = toNum(data.height_cm);
    if (height === null) next.height_cm = 'This field is required';
    else if (Number.isNaN(height) || height <= 100) next.height_cm = 'Enter a height above 100 cm';
    setErrors(next);
    return Object.values(next).every((v) => !v);
  }

  function validateStep2(): boolean {
    const next: Partial<Record<keyof SetupData, string>> = {};
    const weight = toNum(data.weight_lb);
    if (weight === null) next.weight_lb = 'This field is required';
    else if (Number.isNaN(weight) || weight <= 50) next.weight_lb = 'Enter a weight above 50 lb';
    const bodyfat = toNum(data.bodyfat_pct);
    if (bodyfat === null) next.bodyfat_pct = 'This field is required';
    else if (Number.isNaN(bodyfat) || bodyfat < 0 || bodyfat > 60)
      next.bodyfat_pct = 'Enter a body fat % between 0 and 60';
    setErrors(next);
    return Object.values(next).every((v) => !v);
  }

  function handleContinue() {
    if (step === 1 && validateStep1()) setStep(2);
    else if (step === 2 && validateStep2()) setStep(3);
  }

  async function handleFinish() {
    if (!user) return;
    setSaving(true);
    setSaveError(null);
    try {
      await upsertProfile({
        id: user.id,
        user_id: user.id,
        age: toNum(data.age),
        height_cm: toNum(data.height_cm),
        weight_lb: toNum(data.weight_lb),
        bodyfat_pct: toNum(data.bodyfat_pct),
        goal_bodyfat_pct: toNum(data.goal_bodyfat_pct),
        goal_weight_lb: toNum(data.goal_weight_lb),
        training_years: toNum(data.training_years),
        training_time: data.training_time || null,
      });
      // Navigate only after the profile actually saved; a failure keeps the
      // user (and their entered values) on the wizard with a retryable error.
      navigate('/');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  function fieldClass(field: keyof SetupData): string {
    return errors[field] ? 'field border-red-500 dark:border-red-500' : 'field';
  }

  function fieldError(field: keyof SetupData) {
    const message = errors[field];
    return message ? <p className="mt-1 text-sm text-red-500">{message}</p> : null;
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-10">
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <span className="rounded-2xl bg-emerald-500/15 p-4">
          <Dumbbell className="h-9 w-9 text-emerald-500" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-bold">Set up your profile</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            A few details so the coach can personalize your plan.
          </p>
        </div>
      </div>

      <Stepper step={step} />

      <div className="card space-y-4">
        {step === 1 && (
          <>
            <div>
              <label htmlFor="setup-age" className="label">
                Age
              </label>
              <input
                id="setup-age"
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                value={data.age}
                onChange={(e) => set('age', e.target.value)}
                placeholder="e.g. 35"
                className={fieldClass('age')}
              />
              {fieldError('age')}
            </div>
            <div>
              <label htmlFor="setup-height" className="label">
                Height (cm)
              </label>
              <input
                id="setup-height"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.1"
                value={data.height_cm}
                onChange={(e) => set('height_cm', e.target.value)}
                placeholder="e.g. 178"
                className={fieldClass('height_cm')}
              />
              {fieldError('height_cm')}
            </div>
            <div>
              <label htmlFor="setup-training-years" className="label">
                Training experience (years)
              </label>
              <input
                id="setup-training-years"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.5"
                value={data.training_years}
                onChange={(e) => set('training_years', e.target.value)}
                placeholder="e.g. 2.5"
                className={fieldClass('training_years')}
              />
            </div>
            <div>
              <label htmlFor="setup-training-time" className="label">
                Sometimes I train at:
              </label>
              <select
                id="setup-training-time"
                value={data.training_time}
                onChange={(e) => set('training_time', e.target.value)}
                className="field"
              >
                {TRAINING_TIMES.map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" onClick={handleContinue} className="btn-primary">
              Continue
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <label htmlFor="setup-weight" className="label">
                Current weight (lb)
              </label>
              <input
                id="setup-weight"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.1"
                value={data.weight_lb}
                onChange={(e) => set('weight_lb', e.target.value)}
                placeholder="e.g. 212.4"
                className={fieldClass('weight_lb')}
              />
              {fieldError('weight_lb')}
            </div>
            <div>
              <label htmlFor="setup-bodyfat" className="label">
                Body fat (%)
              </label>
              <input
                id="setup-bodyfat"
                type="number"
                inputMode="decimal"
                min={0}
                max={60}
                step="0.1"
                value={data.bodyfat_pct}
                onChange={(e) => set('bodyfat_pct', e.target.value)}
                placeholder="e.g. 24.5"
                className={fieldClass('bodyfat_pct')}
              />
              {fieldError('bodyfat_pct')}
            </div>
            <button type="button" onClick={handleContinue} className="btn-primary">
              Continue
            </button>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="w-full text-center text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400"
            >
              Back to step 1
            </button>
          </>
        )}

        {step === 3 && (
          <>
            <div>
              <label htmlFor="setup-goal-weight" className="label">
                Goal weight (lb)
              </label>
              <input
                id="setup-goal-weight"
                type="number"
                inputMode="decimal"
                min={0}
                value={data.goal_weight_lb}
                onChange={(e) => set('goal_weight_lb', e.target.value)}
                placeholder="e.g. 190"
                className={fieldClass('goal_weight_lb')}
              />
            </div>
            <div>
              <label htmlFor="setup-goal-bodyfat" className="label">
                Goal body fat (%)
              </label>
              <input
                id="setup-goal-bodyfat"
                type="number"
                inputMode="decimal"
                min={0}
                max={60}
                value={data.goal_bodyfat_pct}
                onChange={(e) => set('goal_bodyfat_pct', e.target.value)}
                placeholder="e.g. 15"
                className={fieldClass('goal_bodyfat_pct')}
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
              <h2 className="mb-2 text-sm font-semibold">Summary</h2>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                {summaryRows(data).map((row) => (
                  <div key={row.label}>
                    <dt className="text-xs text-slate-500 dark:text-slate-400">{row.label}</dt>
                    <dd className="text-sm font-medium">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {saveError && (
              <p role="alert" className="text-sm text-red-500">
                Couldn&apos;t save your profile: {saveError}. Your answers are still here — tap
                &ldquo;Let&apos;s go!&rdquo; to try again.
              </p>
            )}

            <button
              type="button"
              onClick={() => void handleFinish()}
              disabled={saving}
              className="btn-primary"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Let&apos;s go!
            </button>
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={saving}
              className="w-full text-center text-sm font-medium text-emerald-600 hover:underline disabled:opacity-50 dark:text-emerald-400"
            >
              Back to step 2
            </button>
          </>
        )}
      </div>
    </div>
  );
}
