import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ErrorBoundary } from '~/components/ErrorBoundary';

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('render exploded');
  return <p>app content</p>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React logs caught render errors; keep test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('app content')).toBeInTheDocument();
  });

  it('catches render errors and shows an accessible recovery UI', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    // The crash is logged for diagnostics…
    expect(console.error).toHaveBeenCalled();
  });

  it('recovers via the try-again action once the cause is gone', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [broken, setBroken] = useState(true);
      return (
        <ErrorBoundary onReset={() => setBroken(false)}>
          <Bomb shouldThrow={broken} />
        </ErrorBoundary>
      );
    }
    render(<Harness />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(screen.getByText('app content')).toBeInTheDocument();
  });
});
