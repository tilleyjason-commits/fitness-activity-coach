import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SaveStatus } from '~/components/SaveStatus';

describe('SaveStatus', () => {
  it('renders nothing before the first change', () => {
    const { container } = render(
      <SaveStatus state={{ status: 'idle', error: null }} onRetry={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('announces pending, saving and saved states via a stable live region (no flicker remount)', () => {
    const { rerender } = render(
      <SaveStatus state={{ status: 'pending', error: null }} onRetry={() => {}} />,
    );
    const region = screen.getByRole('status');
    expect(region).toHaveTextContent(/unsaved/i);

    rerender(<SaveStatus state={{ status: 'saving', error: null }} onRetry={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent(/saving/i);

    rerender(<SaveStatus state={{ status: 'saved', error: null }} onRetry={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent(/saved/i);
  });

  it('shows an accessible error with a working retry action', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <SaveStatus state={{ status: 'error', error: 'network down' }} onRetry={onRetry} />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/network down/);
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
