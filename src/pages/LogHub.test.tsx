import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LogHub from './LogHub';

/**
 * The Log hub is grouped by job — Today / Weekly check-in / Fix a past day —
 * with human copy (no repo vocabulary like "canonical") and the meal tracker
 * in first position.
 */

function renderHub() {
  return render(
    <MemoryRouter
      initialEntries={['/log']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <LogHub />
    </MemoryRouter>,
  );
}

describe('LogHub grouping', () => {
  it('groups links under Today, Weekly check-in, and Fix a past day', () => {
    renderHub();
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Weekly check-in' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Fix a past day' })).toBeInTheDocument();
  });

  it('puts Log meal first in Today, pointing at the meal tracker', () => {
    renderHub();
    const today = screen.getByRole('region', { name: 'Today' });
    const links = within(today).getAllByRole('link');
    expect(links[0]).toHaveAccessibleName(/log meal/i);
    expect(links[0]).toHaveAttribute('href', '/macros');
    expect(within(today).getByRole('link', { name: /supplements/i })).toBeInTheDocument();
    expect(within(today).getByRole('link', { name: /sleep/i })).toBeInTheDocument();
    expect(within(today).getByRole('link', { name: /how you feel/i })).toBeInTheDocument();
  });

  it('keeps weight & waist under the weekly check-in group', () => {
    renderHub();
    const weekly = screen.getByRole('region', { name: 'Weekly check-in' });
    expect(within(weekly).getByRole('link', { name: /weight & waist/i })).toHaveAttribute(
      'href',
      '/log/weight',
    );
  });

  it('renames the backfill pair with verb copy and no developer jargon', () => {
    renderHub();
    const fix = screen.getByRole('region', { name: 'Fix a past day' });
    expect(within(fix).getByRole('link', { name: /training backfill/i })).toHaveAttribute(
      'href',
      '/log/training',
    );
    expect(within(fix).getByText('Mark a missed session complete')).toBeInTheDocument();
    expect(within(fix).getByRole('link', { name: /adjust daily totals/i })).toHaveAttribute(
      'href',
      '/log/nutrition',
    );
    expect(screen.queryByText(/canonical/i)).not.toBeInTheDocument();
  });
});
