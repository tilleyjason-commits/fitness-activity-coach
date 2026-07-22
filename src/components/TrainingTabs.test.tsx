import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TrainingTabs } from './TrainingTabs';

/**
 * One shared segment control for Workout / History / Routines. The tabs ARE
 * the navigation between the three training surfaces — no back arrows.
 */

function renderTabs(ui: React.ReactElement) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {ui}
    </MemoryRouter>,
  );
}

describe('TrainingTabs', () => {
  it('switches Workout/History via onSelect and links Routines to /routines', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderTabs(<TrainingTabs active="workout" onSelect={onSelect} />);

    expect(screen.getByRole('button', { name: 'Workout' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'History' }));
    expect(onSelect).toHaveBeenCalledWith('history');
    expect(screen.getByRole('link', { name: 'Routines' })).toHaveAttribute('href', '/routines');
  });

  it('renders Workout and History as links back to /training on the Routines page', () => {
    renderTabs(<TrainingTabs active="routines" />);

    expect(screen.getByRole('link', { name: 'Workout' })).toHaveAttribute('href', '/training');
    expect(screen.getByRole('link', { name: 'History' })).toHaveAttribute(
      'href',
      expect.stringContaining('tab=history'),
    );
    expect(screen.getByText('Routines')).toHaveAttribute('aria-current', 'page');
  });

  it('uses a neutral filled selection state, not the emerald action color', () => {
    renderTabs(<TrainingTabs active="routines" />);
    const active = screen.getByText('Routines');
    expect(active.className).not.toMatch(/emerald/);
    expect(active.className).toMatch(/bg-slate-900/);
  });

  it('meets the 44px control floor on every tab', () => {
    const { container } = renderTabs(<TrainingTabs active="workout" onSelect={() => {}} />);
    for (const el of container.querySelectorAll('a, button, span[aria-current]')) {
      expect(el.className).toMatch(/min-h-11/);
    }
  });
});
