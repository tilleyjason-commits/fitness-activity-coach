import { afterEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useIsDark } from './useIsDark';

/**
 * Charts read theme through this hook so a toggle elsewhere re-renders their
 * tooltip/cursor colors immediately — no remount required.
 */

function Probe() {
  return <span data-testid="probe">{useIsDark() ? 'dark' : 'light'}</span>;
}

afterEach(() => {
  document.documentElement.classList.remove('dark');
});

describe('useIsDark', () => {
  it('tracks the documentElement dark class live', async () => {
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('light');

    await act(async () => {
      document.documentElement.classList.add('dark');
      // MutationObserver callbacks flush on a microtask.
      await Promise.resolve();
    });
    expect(screen.getByTestId('probe')).toHaveTextContent('dark');

    await act(async () => {
      document.documentElement.classList.remove('dark');
      await Promise.resolve();
    });
    expect(screen.getByTestId('probe')).toHaveTextContent('light');
  });

  it('reads an already-dark document on first render', () => {
    document.documentElement.classList.add('dark');
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('dark');
  });
});
