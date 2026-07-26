import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Skeleton, SkeletonCard, SkeletonStat } from './Skeleton';
import { Logo } from './Logo';

/**
 * Loading states are announced, not just animated: a screen reader gets a
 * live-region label while sighted users get bars shaped like the content
 * that will replace them.
 */

describe('SkeletonCard', () => {
  it('announces what is loading', () => {
    render(<SkeletonCard label="Evaluating today's rules" />);

    const status = screen.getByRole('status', { name: "Evaluating today's rules" });
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent("Evaluating today's rules");
  });

  it('renders one bar per requested line', () => {
    const { container } = render(
      <SkeletonCard label="Loading" lines={['w-1/4', 'w-full', 'w-2/3']} />,
    );

    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(3);
  });

  it('hides the decorative bars from assistive tech', () => {
    const { container } = render(<Skeleton className="h-4 w-10" />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden');
  });

  it('renders a caption bar above a figure bar for stats', () => {
    const { container } = render(<SkeletonStat />);
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(2);
  });
});

describe('Logo', () => {
  it('exposes the app name to assistive tech', () => {
    render(<Logo />);
    expect(screen.getByRole('img', { name: 'Fitness Activity Coach' })).toBeInTheDocument();
  });

  it('omits the wordmark unless asked', () => {
    const { rerender } = render(<Logo />);
    expect(screen.queryByText(/Coach$/)).not.toBeInTheDocument();

    rerender(<Logo withWordmark />);
    expect(screen.getByText('Coach')).toBeInTheDocument();
  });

  it('scales the mark from the size prop', () => {
    const { container } = render(<Logo size={64} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '64');
    expect(svg).toHaveAttribute('height', '64');
  });
});
