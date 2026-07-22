import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusDot } from './StatusDot';

/**
 * Pass/fail/pending must be readable without color: pass = check mark,
 * fail = ×, pending = hollow ring. Color stays as reinforcement.
 */

describe('StatusDot shape redundancy', () => {
  it('renders a check mark for pass, not a plain filled circle', () => {
    const { container } = render(<StatusDot status="pass" label="Train" />);
    expect(screen.getByRole('img', { name: 'Train: done' })).toBeInTheDocument();
    expect(container.querySelector('svg.lucide-check')).toBeInTheDocument();
  });

  it('renders an × for fail', () => {
    const { container } = render(<StatusDot status="fail" label="Protein" />);
    expect(screen.getByRole('img', { name: 'Protein: missed' })).toBeInTheDocument();
    expect(container.querySelector('svg.lucide-x')).toBeInTheDocument();
  });

  it('renders a hollow ring for pending (no icon, border only)', () => {
    const { container } = render(<StatusDot status="pending" label="Sleep" />);
    const dot = screen.getByRole('img', { name: 'Sleep: not logged yet' });
    expect(dot.className).toMatch(/border-2/);
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  it('keeps captions at the 12px floor', () => {
    render(<StatusDot status="pass" label="Train" />);
    expect(screen.getByText('Train').className).toMatch(/text-xs/);
  });
});
