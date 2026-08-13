import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RestTimer } from './RestTimer';
import { loadPersistedTimer } from '~/lib/rest-timer';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (navigator as any).vibrate;
});

/** Start a 90s timer and jump wall time past the deadline. */
function startAndFinish(props: Parameters<typeof RestTimer>[0] = {}) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(0));
  render(<RestTimer initialSeconds={90} {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  act(() => {
    vi.setSystemTime(new Date(120_000));
    vi.runOnlyPendingTimers();
  });
}

describe('RestTimer finish alerts', () => {
  it('vibrates [200,100,200] when the countdown finishes', () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true, writable: true });

    startAndFinish();

    expect(vibrate).toHaveBeenCalledWith([200, 100, 200]);
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('still finishes cleanly when vibration is unsupported and audio construction throws', () => {
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('audio unavailable');
        }
      },
    );

    startAndFinish();

    expect(screen.getByRole('status')).toHaveTextContent(/rest complete/i);
  });

  it('keeps the finished state on screen instead of auto-dismissing', () => {
    const onClose = vi.fn();
    startAndFinish({ onClose });

    act(() => {
      vi.setSystemTime(new Date(130_000));
      vi.advanceTimersByTime(10_000);
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(/rest complete/i);

    fireEvent.click(screen.getByRole('button', { name: 'Close rest timer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('gives the close control a 44px hit target', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    render(<RestTimer initialSeconds={90} onClose={() => {}} />);
    const close = screen.getByRole('button', { name: 'Close rest timer' });
    expect(close.className).toMatch(/min-h-11/);
    expect(close.className).toMatch(/min-w-11/);
  });
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
      vi.runOnlyPendingTimers();
    });

    expect(screen.getByText('Rest complete')).toBeInTheDocument();
  });

  it('pauses and resumes from the wall-clock remaining value', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    render(<RestTimer initialSeconds={90} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    act(() => {
      vi.setSystemTime(new Date(30_000));
      vi.runOnlyPendingTimers();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByText('1:00')).toBeInTheDocument();

    act(() => vi.setSystemTime(new Date(90_000)));
    expect(screen.getByText('1:00')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    act(() => {
      vi.setSystemTime(new Date(150_000));
      vi.runOnlyPendingTimers();
    });
    expect(screen.getByText('Rest complete')).toBeInTheDocument();
  });
});

describe('RestTimer persistence across a reload', () => {
  // A backgrounded mobile tab can have its whole JS context discarded and
  // recreated on the next reload — React never gets to run unmount cleanup
  // for the old instance. Rendering a second, independent instance without
  // unmounting the first approximates that: nothing hands off state in
  // memory, only whatever the first instance last wrote to localStorage.
  it('restores a running countdown from localStorage instead of resetting it', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    render(<RestTimer initialSeconds={90} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    act(() => {
      vi.setSystemTime(new Date(30_000));
    });

    render(<RestTimer initialSeconds={90} />);
    expect(screen.getByText('1:00')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Pause' })).toHaveLength(2);
  });

  it('shows finished immediately when the deadline passed while backgrounded', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    render(<RestTimer initialSeconds={90} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    // Jump the wall clock past the deadline without letting the first
    // instance's own display interval ever run, so its persisted state is
    // still the stale "running" snapshot from the moment Start was pressed.
    act(() => {
      vi.setSystemTime(new Date(120_000));
    });

    render(<RestTimer initialSeconds={90} />);
    expect(screen.getByText('Rest complete')).toBeInTheDocument();
  });

  it('clears the persisted timer on close so it does not reappear', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    const onClose = vi.fn();
    render(<RestTimer initialSeconds={90} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(loadPersistedTimer()).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Close rest timer' }));
    expect(loadPersistedTimer()).toBeNull();
  });
});

describe('RestTimer remount persistence', () => {
  it('does not restart a running countdown after unmount/remount', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    localStorage.clear();

    const first = render(<RestTimer autoStartKey={1} initialSeconds={90} />);
    expect(screen.getByText('1:30')).toBeInTheDocument();

    act(() => {
      vi.setSystemTime(new Date(30_000));
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByText('1:00')).toBeInTheDocument();

    first.unmount();
    render(<RestTimer autoStartKey={1} initialSeconds={90} />);

    expect(screen.getByText('1:00')).toBeInTheDocument();
    expect(screen.queryByText('1:30')).not.toBeInTheDocument();
  });

  it('does not keep counting a paused timer across remount', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    localStorage.clear();

    const first = render(<RestTimer autoStartKey={1} initialSeconds={90} />);
    act(() => {
      vi.setSystemTime(new Date(30_000));
      vi.advanceTimersByTime(250);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByText('1:00')).toBeInTheDocument();

    first.unmount();
    act(() => {
      vi.setSystemTime(new Date(90_000));
    });
    render(<RestTimer autoStartKey={1} initialSeconds={90} />);

    expect(screen.getByText('1:00')).toBeInTheDocument();
    expect(screen.getByText('paused')).toBeInTheDocument();
  });
});
