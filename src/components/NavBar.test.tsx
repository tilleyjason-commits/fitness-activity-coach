import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NavBar } from './NavBar';

/**
 * Route → tab ownership (approved 5-tab IA). The meal tracker is a Log-tab
 * surface: standing in the kitchen on /macros, the nav must light up Log,
 * never More.
 */

function renderAt(path: string) {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <NavBar />
    </MemoryRouter>,
  );
}

function activeTab(): string | null {
  const links = screen.getAllByRole('link');
  const active = links.filter((link) => link.getAttribute('aria-current') === 'page');
  expect(active.length).toBeLessThanOrEqual(1);
  return active[0]?.textContent ?? null;
}

describe('NavBar tab ownership', () => {
  it('renders the five approved tabs with exact labels', () => {
    renderAt('/');
    expect(screen.getAllByRole('link').map((l) => l.textContent)).toEqual([
      'Home',
      'Workout',
      'Log',
      'Progress',
      'More',
    ]);
  });

  it('marks Log active on /macros (not More)', () => {
    renderAt('/macros');
    expect(activeTab()).toBe('Log');
  });

  it('keeps More active only for /settings routes', () => {
    renderAt('/settings');
    expect(activeTab()).toBe('More');
  });

  it('keeps Log active for the log hub and its children', () => {
    renderAt('/log/sleep');
    expect(activeTab()).toBe('Log');
  });
});
