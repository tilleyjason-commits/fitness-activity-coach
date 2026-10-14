/**
 * Unit handling. The database always stores canonical units (height in cm,
 * weight in lb, waist in inches). A user's preferred system only changes what
 * the UI shows and accepts. `user_settings.preferred_units` stores 'lb' | 'kg'.
 */

export type UnitSystem = 'us' | 'metric';
export type StoredUnits = 'lb' | 'kg';

const CM_PER_IN = 2.54;
const LB_PER_KG = 2.2046226218;

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function unitsFromStored(stored: string | null | undefined): UnitSystem {
  return stored === 'kg' ? 'metric' : 'us';
}

export function storedFromUnits(units: UnitSystem): StoredUnits {
  return units === 'metric' ? 'kg' : 'lb';
}

export const heightUnitLabel = (u: UnitSystem): string => (u === 'us' ? 'in' : 'cm');
export const weightUnitLabel = (u: UnitSystem): string => (u === 'us' ? 'lb' : 'kg');
export const waistUnitLabel = (u: UnitSystem): string => (u === 'us' ? 'in' : 'cm');

/** Canonical (cm) -> display value. */
export const heightFromCm = (cm: number, u: UnitSystem): number =>
  round1(u === 'us' ? cm / CM_PER_IN : cm);
/** Display value -> canonical cm. */
export const heightToCm = (v: number, u: UnitSystem): number =>
  round1(u === 'us' ? v * CM_PER_IN : v);

/** Canonical (lb) -> display value. */
export const weightFromLb = (lb: number, u: UnitSystem): number =>
  round1(u === 'us' ? lb : lb / LB_PER_KG);
/** Display value -> canonical lb. */
export const weightToLb = (v: number, u: UnitSystem): number =>
  round1(u === 'us' ? v : v * LB_PER_KG);

/** Canonical (inches) -> display value. */
export const waistFromInches = (inches: number, u: UnitSystem): number =>
  round1(u === 'us' ? inches : inches * CM_PER_IN);
/** Display value -> canonical inches. */
export const waistToInches = (v: number, u: UnitSystem): number =>
  round1(u === 'us' ? v : v / CM_PER_IN);

export type MeasureKind = 'height' | 'weight' | 'waist';

/**
 * Re-express a number the user typed in one system in the other, so toggling
 * units never silently reinterprets the digits. Blank or non-numeric input is
 * returned unchanged.
 */
export function convertTyped(
  value: string,
  kind: MeasureKind,
  from: UnitSystem,
  to: UnitSystem,
): string {
  if (from === to || value.trim() === '') return value;
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  switch (kind) {
    case 'height':
      return String(heightFromCm(heightToCm(n, from), to));
    case 'weight':
      return String(weightFromLb(weightToLb(n, from), to));
    case 'waist':
      return String(waistFromInches(waistToInches(n, from), to));
  }
}
