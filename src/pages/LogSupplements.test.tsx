import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { format, subDays } from 'date-fns';
import LogSupplements from '~/pages/LogSupplements';
import type { UserSupplement } from '~/lib/types';

const useSupplementsMock = vi.fn();
vi.mock('~/hooks/useSupplements', () => ({
  useSupplements: (...a: unknown[]) => useSupplementsMock(...a),
}));

const useSupplementDayMock = vi.fn();
vi.mock('~/hooks/useSupplementDay', () => ({
  useSupplementDay: (...a: unknown[]) => useSupplementDayMock(...a),
}));

function makeSupplement(overrides: Partial<UserSupplement> = {}): UserSupplement {
  return {
    id: 'supp-1',
    user_id: 'user-1',
    slug: 'creatine',
    name: 'Creatine',
    dose_amount: null,
    dose_unit: null,
    instructions: null,
    active: true,
    sort_order: 0,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

interface DayState {
  takenIds: Set<string>;
  savingIds: Set<string>;
  errors: Map<string, { taken: boolean; message: string }>;
  loading: boolean;
  error: string | null;
  toggle: ReturnType<typeof vi.fn>;
  reload: ReturnType<typeof vi.fn>;
}

let listState: {
  supplements: UserSupplement[];
  loading: boolean;
  error: string | null;
  add: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  reload: ReturnType<typeof vi.fn>;
};
let dayState: DayState;

function renderPage() {
  return render(
    <MemoryRouter
      initialEntries={['/log/supplements']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <LogSupplements />
    </MemoryRouter>,
  );
}

const today = () => format(new Date(), 'yyyy-MM-dd');
const yesterday = () => format(subDays(new Date(), 1), 'yyyy-MM-dd');

beforeEach(() => {
  vi.clearAllMocks();
  listState = {
    supplements: [
      makeSupplement({
        id: 'supp-1', slug: 'creatine', name: 'Creatine', dose_amount: 5, dose_unit: 'g',
      }),
      makeSupplement({
        id: 'supp-2', slug: 'x9y8-custom', name: 'Ashwagandha', instructions: 'before bed',
      }),
      makeSupplement({ id: 'supp-3', slug: 'magnesium', name: 'Magnesium', active: false }),
    ],
    loading: false,
    error: null,
    add: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    reload: vi.fn(),
  };
  dayState = {
    takenIds: new Set<string>(),
    savingIds: new Set<string>(),
    errors: new Map(),
    loading: false,
    error: null,
    toggle: vi.fn().mockResolvedValue(true),
    reload: vi.fn(),
  };
  useSupplementsMock.mockImplementation(() => listState);
  useSupplementDayMock.mockImplementation(() => dayState);
});

describe('active supplement switches', () => {
  it('renders one accessible switch per active supplement, none for inactive', () => {
    renderPage();
    expect(screen.getByRole('switch', { name: /Creatine/ })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Ashwagandha/ })).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: /Magnesium/ })).not.toBeInTheDocument();
  });

  it('shows user-entered dose summaries and no hard-coded recommendations', () => {
    renderPage();
    expect(screen.getByText('5 g')).toBeInTheDocument();
    expect(screen.getByText('before bed')).toBeInTheDocument();
    expect(screen.queryByText(/5 g daily/)).not.toBeInTheDocument();
    expect(screen.queryByText(/timing doesn't matter/i)).not.toBeInTheDocument();
  });

  it('toggling on calls toggle with taken=true and announces Saved', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('switch', { name: /Creatine/ }));

    expect(dayState.toggle).toHaveBeenCalledWith('supp-1', true);
    expect(await screen.findByRole('status')).toHaveTextContent('Saved');
  });

  it('toggling an already-taken supplement calls toggle with taken=false', async () => {
    dayState.takenIds = new Set(['supp-1']);
    const user = userEvent.setup();
    renderPage();

    const creatine = screen.getByRole('switch', { name: /Creatine/ });
    expect(creatine).toHaveAttribute('aria-checked', 'true');
    await user.click(creatine);

    expect(dayState.toggle).toHaveBeenCalledWith('supp-1', false);
  });

  it('disables the switch while its save is in flight', () => {
    dayState.savingIds = new Set(['supp-1']);
    renderPage();

    expect(screen.getByRole('switch', { name: /Creatine/ })).toBeDisabled();
    expect(screen.getByRole('switch', { name: /Ashwagandha/ })).toBeEnabled();
  });

  it('shows an accessible item error with a retry that re-attempts the failed toggle', async () => {
    dayState.errors = new Map([['supp-1', { taken: true, message: 'network down' }]]);
    const user = userEvent.setup();
    renderPage();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/network down/);
    await user.click(screen.getByRole('button', { name: /retry/i }));

    expect(dayState.toggle).toHaveBeenCalledWith('supp-1', true);
  });
});

describe('date selection', () => {
  it('defaults to today with the next-day control disabled', () => {
    renderPage();
    expect(useSupplementDayMock).toHaveBeenLastCalledWith(today());
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous day' })).toBeEnabled();
  });

  it('steps back to the previous day and forward again, never past today', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(useSupplementDayMock).toHaveBeenLastCalledWith(yesterday());
    expect(screen.queryByText('Today')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next day' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Next day' }));
    expect(useSupplementDayMock).toHaveBeenLastCalledWith(today());
    expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled();
  });
});

describe('page states and navigation', () => {
  it('links to supplement management', () => {
    renderPage();
    const manage = screen.getByRole('link', { name: 'Manage supplements' });
    expect(manage).toHaveAttribute('href', expect.stringContaining('/settings/supplements'));
  });

  it('shows a loading state without switches or empty-state text', () => {
    listState.loading = true;
    renderPage();
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(screen.queryByText(/no supplements/i)).not.toBeInTheDocument();
  });

  it('shows a retryable error state when the list fails to load', async () => {
    listState.error = 'relation missing';
    listState.supplements = [];
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByText(/relation missing/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(listState.reload).toHaveBeenCalled();
  });

  it('shows a retryable error state when the day logs fail to load', async () => {
    dayState.error = 'network down';
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByText(/network down/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(dayState.reload).toHaveBeenCalled();
  });

  it('empty state links to management setup', () => {
    listState.supplements = [];
    renderPage();

    expect(screen.getByText(/no supplements in your list yet/i)).toBeInTheDocument();
    const setup = screen.getByRole('link', { name: /set up supplements/i });
    expect(setup).toHaveAttribute('href', expect.stringContaining('/settings/supplements'));
  });

  it('treats a list with only inactive supplements as empty', () => {
    listState.supplements = [makeSupplement({ id: 'supp-3', slug: 'magnesium', active: false })];
    renderPage();

    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(screen.getByText(/no supplements in your list yet/i)).toBeInTheDocument();
  });
});
