import { describe, expect, it } from 'vitest';
import {
  convertTyped,
  heightFromCm,
  heightToCm,
  storedFromUnits,
  unitsFromStored,
  waistFromInches,
  weightFromLb,
  weightToLb,
} from '~/lib/units';

describe('units', () => {
  it('maps the stored lb/kg setting to a system and back', () => {
    expect(unitsFromStored('kg')).toBe('metric');
    expect(unitsFromStored('lb')).toBe('us');
    expect(unitsFromStored(undefined)).toBe('us');
    expect(storedFromUnits('metric')).toBe('kg');
    expect(storedFromUnits('us')).toBe('lb');
  });

  it('converts canonical values for display', () => {
    expect(heightFromCm(182.9, 'us')).toBe(72);
    expect(heightFromCm(178, 'metric')).toBe(178);
    expect(weightFromLb(200, 'metric')).toBe(90.7);
    expect(weightFromLb(200, 'us')).toBe(200);
    expect(waistFromInches(36, 'metric')).toBe(91.4);
  });

  it('round-trips display input to canonical storage', () => {
    expect(heightToCm(72, 'us')).toBe(182.9);
    expect(weightToLb(90.7, 'metric')).toBe(200);
  });

  it('re-expresses typed values when the toggle changes instead of reinterpreting digits', () => {
    expect(convertTyped('72', 'height', 'us', 'metric')).toBe('182.9');
    expect(convertTyped('178', 'height', 'metric', 'us')).toBe('70.1');
    expect(convertTyped('200', 'weight', 'us', 'metric')).toBe('90.7');
    expect(convertTyped('96.3', 'weight', 'metric', 'us')).toBe('212.3');
    expect(convertTyped('', 'weight', 'us', 'metric')).toBe('');
    expect(convertTyped('abc', 'height', 'us', 'metric')).toBe('abc');
    expect(convertTyped('72', 'height', 'us', 'us')).toBe('72');
  });
});
