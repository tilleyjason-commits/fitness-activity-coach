import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RestTimer } from './RestTimer';

afterEach(() => {
  vi.useRealTimers();
});

describe('RestTimer wall-clock integration', () => {
  it('finishes from elapsed wall time even when only one display tick runs', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    render(<RestTimer initialSeconds={90} />);

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    act(() => {
      // Simulate a backgrounded/locked browser: wall time jumps past the
      // deadline before the next throttled display callback executes.
      vi.setSystemTime(new Date(120_000));
      vi.advanceTimersToNextTimer();
    });

    expect(screen.getByText('Done!')).toBeInTheDocument();
  });

  it('pauses and resumes from the wall-clock remaining value', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    render(<RestTimer initialSeconds={90} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    act(() => {
      vi.setSystemTime(new Date(30_000));
      vi.advanceTimersToNextTimer();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByText('1:00')).toBeInTheDocument();

    act(() => vi.setSystemTime(new Date(90_000)));
    expect(screen.getByText('1:00')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    act(() => {
      vi.setSystemTime(new Date(150_000));
      vi.advanceTimersToNextTimer();
    });
    expect(screen.getByText('Done!')).toBeInTheDocument();
  });
});
