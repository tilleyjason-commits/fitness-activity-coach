import { describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useFocusTrap } from '~/hooks/useFocusTrap';

function Harness({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open, onClose);
  return (
    <div>
      <button type="button">outside</button>
      {open && (
        <div ref={ref} role="dialog" aria-modal="true" tabIndex={-1}>
          <button type="button">first</button>
          <button type="button">last</button>
        </div>
      )}
    </div>
  );
}

describe('useFocusTrap', () => {
  it('moves focus into the dialog and keeps Tab / Shift+Tab inside it', async () => {
    const user = userEvent.setup();
    render(<Harness open onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'last' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'last' })).toHaveFocus();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness open onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('gives focus back to the element that opened it', async () => {
    const onClose = vi.fn();
    const { rerender } = render(<Harness open={false} onClose={onClose} />);
    screen.getByRole('button', { name: 'outside' }).focus();
    rerender(<Harness open onClose={onClose} />);
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus();
    rerender(<Harness open={false} onClose={onClose} />);
    expect(screen.getByRole('button', { name: 'outside' })).toHaveFocus();
  });
});
