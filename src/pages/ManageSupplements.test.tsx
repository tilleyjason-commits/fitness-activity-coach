import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ManageSupplements from '~/pages/ManageSupplements';
import type { UserSupplement } from '~/lib/types';

const useSupplementsMock = vi.fn();
vi.mock('~/hooks/useSupplements', () => ({
  useSupplements: (...a: unknown[]) => useSupplementsMock(...a),
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

let listState: {
  supplements: UserSupplement[];
  loading: boolean;
  error: string | null;
  add: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  reload: ReturnType<typeof vi.fn>;
};

function renderPage() {
  return render(
    <MemoryRouter
      initialEntries={['/settings/supplements']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <ManageSupplements />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listState = {
    supplements: [
      makeSupplement({ id: 'supp-1', slug: 'creatine', name: 'Creatine' }),
      makeSupplement({
        id: 'supp-2', slug: 'x9y8-custom', name: 'Ashwagandha', instructions: 'before bed',
      }),
      makeSupplement({
        id: 'supp-3', slug: 'vitamin-d', name: 'Vitamin D', active: false,
      }),
    ],
    loading: false,
    error: null,
    add: vi.fn().mockResolvedValue(makeSupplement({ id: 'new' })),
    update: vi.fn().mockImplementation(async (_id: string, patch: Partial<UserSupplement>) =>
      makeSupplement(patch),
    ),
    remove: vi.fn().mockResolvedValue(true),
    reload: vi.fn(),
  };
  useSupplementsMock.mockImplementation(() => listState);
});

describe('quick-add chips', () => {
  it('offers chips only for built-ins not already in the list (active or inactive)', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Add Magnesium' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Omega-3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Beta-Alanine' })).toBeInTheDocument();
    // Creatine is active, Vitamin D inactive — neither gets a chip.
    expect(screen.queryByRole('button', { name: 'Add Creatine' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Vitamin D' })).not.toBeInTheDocument();
  });

  it('quick-add uses the canonical slug and name', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Add Magnesium' }));

    expect(listState.add).toHaveBeenCalledWith({ slug: 'magnesium', name: 'Magnesium' });
  });
});

describe('custom add', () => {
  it('adds a custom supplement with a trimmed name and no slug', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /add custom supplement/i }));
    await user.type(screen.getByLabelText(/name/i), '  Fish Oil  ');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(listState.add).toHaveBeenCalledTimes(1);
    const payload = listState.add.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.name).toBe('Fish Oil');
    expect(payload).not.toHaveProperty('slug');
  });

  it('requires a name', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /add custom supplement/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(listState.add).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/name/i);
  });

  it('rejects a non-positive dose amount', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /add custom supplement/i }));
    await user.type(screen.getByLabelText(/name/i), 'Zinc');
    // fireEvent: jsdom sanitizes minus-sign keystrokes typed into number inputs.
    fireEvent.change(screen.getByLabelText(/dose amount/i), { target: { value: '-5' } });
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(listState.add).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/dose/i);
  });

  it('surfaces save failures in the editor', async () => {
    listState.add.mockRejectedValue(new Error('duplicate key'));
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /add custom supplement/i }));
    await user.type(screen.getByLabelText(/name/i), 'Zinc');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/duplicate key/);
  });
});

describe('editing', () => {
  it('saves edited name, dose, unit, and instructions', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Edit Creatine' }));
    const dose = screen.getByLabelText(/dose amount/i);
    await user.clear(dose);
    await user.type(dose, '5');
    await user.type(screen.getByLabelText(/unit/i), 'g');
    await user.type(screen.getByLabelText(/instructions/i), 'any consistent time');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(listState.update).toHaveBeenCalledWith('supp-1', {
      name: 'Creatine',
      dose_amount: 5,
      dose_unit: 'g',
      instructions: 'any consistent time',
    });
  });

  it('offers unit suggestions without prescribing a dose', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Edit Creatine' }));
    const unit = screen.getByLabelText(/unit/i);
    expect(unit).toHaveAttribute('list');
  });
});

describe('activate / deactivate', () => {
  it('deactivates an active supplement from its row switch', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('switch', { name: 'Creatine active' }));

    expect(listState.update).toHaveBeenCalledWith('supp-1', { active: false });
  });

  it('lists inactive supplements in a recoverable Inactive section and reactivates them', async () => {
    const user = userEvent.setup();
    renderPage();

    const inactiveSection = screen.getByRole('region', { name: /inactive/i });
    const vitaminSwitch = within(inactiveSection).getByRole('switch', { name: 'Vitamin D active' });
    expect(vitaminSwitch).toHaveAttribute('aria-checked', 'false');
    await user.click(vitaminSwitch);

    expect(listState.update).toHaveBeenCalledWith('supp-3', { active: true });
  });
});

describe('guarded delete', () => {
  it('requires explicit confirmation for custom supplements and states what is removed', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Edit Ashwagandha' }));
    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(listState.remove).not.toHaveBeenCalled();
    const confirm = screen.getByRole('alertdialog');
    expect(confirm).toHaveTextContent(/check-in history/i);
    expect(confirm).toHaveTextContent(/daily.log (records|history).*(kept|retained)/i);

    await user.click(within(confirm).getByRole('button', { name: /delete ashwagandha/i }));
    expect(listState.remove).toHaveBeenCalledWith('supp-2');
  });

  it('keeps canonical built-ins recoverable through deactivate and does not hard-delete them', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Edit Creatine' }));

    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();
  });

  it('cancelling the confirmation keeps the custom supplement', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Edit Ashwagandha' }));
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /keep/i }));

    expect(listState.remove).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

describe('page states', () => {
  it('shows a retryable error state', async () => {
    listState.error = 'relation missing';
    listState.supplements = [];
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByText(/relation missing/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(listState.reload).toHaveBeenCalled();
  });

  it('empty list shows all five quick-add chips and an explainer', () => {
    listState.supplements = [];
    renderPage();

    for (const name of ['Creatine', 'Vitamin D', 'Magnesium', 'Omega-3', 'Beta-Alanine']) {
      expect(screen.getByRole('button', { name: `Add ${name}` })).toBeInTheDocument();
    }
    expect(screen.getByText(/add your first supplement/i)).toBeInTheDocument();
  });
});
