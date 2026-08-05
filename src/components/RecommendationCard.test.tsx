import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RecommendationCard } from './RecommendationCard';

/**
 * Dismissing a coaching card is destructive-ish (it hides advice), so the ×
 * needs a 44px target; the severity badge and domain caption are functional
 * labels and sit at the 12px floor.
 */

describe('RecommendationCard accessibility', () => {
  it('meets the 44px floor on the dismiss control', async () => {
    const onDismiss = vi.fn();
    render(
      <RecommendationCard
        severity="high"
        message="Protein 40g behind pace."
        domain="nutrition"
        onDismiss={onDismiss}
      />,
    );
    const dismiss = screen.getByRole('button', { name: 'Dismiss recommendation' });
    expect(dismiss.className).toMatch(/min-h-11/);
    expect(dismiss.className).toMatch(/min-w-11/);
    await userEvent.setup().click(dismiss);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('keeps badge and domain captions at the 12px floor', () => {
    render(<RecommendationCard severity="high" message="Msg" domain="nutrition" />);
    expect(screen.getByText('High').className).toMatch(/text-xs/);
    expect(screen.getByText('nutrition').className).toMatch(/text-xs/);
  });

  it('surfaces an action link and evidence disclosure when provided', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <RecommendationCard
          severity="medium"
          message="Caffeine was late."
          domain="sleep"
          actionTo="/log/sleep"
          actionLabel="Log sleep"
          evidence="Caffeine near bedtime can reduce sleep quality."
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /log sleep/i })).toHaveAttribute('href', '/log/sleep');
    expect(screen.getByText(/why this advice/i)).toBeInTheDocument();
    expect(screen.getByText(/caffeine near bedtime/i)).toBeInTheDocument();
  });
});
