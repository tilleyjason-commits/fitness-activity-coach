import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DayMacroSummary } from './DayMacroSummary';
import { DEFAULT_TARGETS } from '~/lib/constants';

/**
 * Protein is the coaching priority, so it gets its own progress bar next to
 * calories instead of hiding inside the number grid.
 */

describe('DayMacroSummary protein priority', () => {
  it('renders a protein progress bar alongside the calorie bar', () => {
    render(
      <DayMacroSummary calories={1200} protein={100} carbs={120} fat={40} targets={DEFAULT_TARGETS} />,
    );

    const proteinBar = screen.getByRole('progressbar', { name: 'Protein vs target' });
    const expectedPct = Math.min(100, Math.round((100 / DEFAULT_TARGETS.proteinG) * 100));
    expect(proteinBar).toHaveAttribute('aria-valuenow', String(expectedPct));
    expect(screen.getByRole('progressbar', { name: 'Calories vs target' })).toBeInTheDocument();
  });

  it('caps the protein bar at 100%', () => {
    render(
      <DayMacroSummary calories={2500} protein={400} carbs={120} fat={40} targets={DEFAULT_TARGETS} />,
    );
    expect(screen.getByRole('progressbar', { name: 'Protein vs target' })).toHaveAttribute(
      'aria-valuenow',
      '100',
    );
  });
});
