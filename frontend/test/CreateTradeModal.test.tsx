import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateTradeModal } from '../src/components/CreateTradeModal.js';

describe('CreateTradeModal', () => {
  it('rejects submission with an empty symbol and shows a field error', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<CreateTradeModal onClose={vi.fn()} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: /create trade/i }));

    await waitFor(() => {
      expect(screen.getByText(/symbol is required/i)).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits a valid trade and closes', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CreateTradeModal onClose={onClose} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/symbol/i), 'AAPL');
    await user.type(screen.getByLabelText(/quantity/i), '100');
    await user.type(screen.getByLabelText(/price/i), '189.50');
    await user.type(screen.getByLabelText(/trader/i), 'jdoe');
    await user.type(screen.getByLabelText(/book/i), 'EQ-LON-01');
    await user.type(screen.getByLabelText(/counterparty/i), 'GOLDMAN');

    await user.click(screen.getByRole('button', { name: /create trade/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ symbol: 'AAPL', quantity: 100, price: 189.5 }),
      );
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes without submitting when Cancel is clicked', async () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CreateTradeModal onClose={onClose} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(onClose).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
