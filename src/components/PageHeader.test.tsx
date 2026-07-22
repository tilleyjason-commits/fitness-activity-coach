import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('gives the back link a 44px hit target', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PageHeader title="Log Sleep" backTo="/log" />
      </MemoryRouter>,
    );
    const back = screen.getByRole('link', { name: 'Back' });
    expect(back).toHaveAttribute('href', '/log');
    expect(back.className).toMatch(/min-h-11/);
    expect(back.className).toMatch(/min-w-11/);
  });

  it('renders no back link on root pages', () => {
    render(<PageHeader title="Progress" />);
    expect(screen.queryByRole('link', { name: 'Back' })).not.toBeInTheDocument();
  });
});
