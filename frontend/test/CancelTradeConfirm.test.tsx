import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Trade } from '@fusion-blotter/shared';
import { CancelTradeConfirm } from '../src/components/CancelTradeConfirm.js';

const trade: Trade = {
  id: 'trade-1',
  tradeId: 'TRD-100001',
  symbol: 'MSFT',
  side: 'SELL',
  quantity: 2500,
  price: 410.5,
  trader: 'asmith',
  book: 'EQ-NY-02',
  counterparty: 'JPM',
  tradeTimestamp: '2026-09-20T14:30:00.000Z',
  status: 'ACTIVE',
  createdAt: '2026-09-20T14:30:00.000Z',
  updatedAt: '2026-09-20T14:30:00.000Z',
};

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(onConfirm = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)) {
  const user = userEvent.setup();
  const onDismiss = vi.fn();
  const view = render(
    <CancelTradeConfirm trade={trade} onConfirm={onConfirm} onDismiss={onDismiss} />,
  );
  return { user, onConfirm, onDismiss, view };
}

const keepButton = () => screen.getByRole('button', { name: 'Keep Trade' });
const cancelButton = () => screen.getByRole('button', { name: 'Cancel Trade' });

describe('CancelTradeConfirm', () => {
  describe('accessibility', () => {
    it('is an alertdialog named by the trade id and described by the warning', () => {
      setup();
      const dialog = screen.getByRole('alertdialog', { name: 'Cancel TRD-100001?' });
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAccessibleDescription(
        'This will mark the trade as cancelled. This action cannot be undone.',
      );
    });

    it('gives each open dialog its own title and description ids', () => {
      render(
        <>
          <CancelTradeConfirm trade={trade} onConfirm={vi.fn()} onDismiss={vi.fn()} />
          <CancelTradeConfirm
            trade={{ ...trade, id: 'trade-2', tradeId: 'TRD-100002' }}
            onConfirm={vi.fn()}
            onDismiss={vi.fn()}
          />
        </>,
      );
      const [first, second] = screen.getAllByRole('alertdialog');
      expect(first).toHaveAccessibleName('Cancel TRD-100001?');
      expect(second).toHaveAccessibleName('Cancel TRD-100002?');
      expect(first!.getAttribute('aria-labelledby')).not.toBe(
        second!.getAttribute('aria-labelledby'),
      );
      expect(first!.getAttribute('aria-describedby')).not.toBe(
        second!.getAttribute('aria-describedby'),
      );
    });

    it('focuses Keep Trade on open so a stray Enter keeps the trade', async () => {
      const { user, onConfirm, onDismiss } = setup();
      expect(keepButton()).toHaveFocus();

      await user.keyboard('{Enter}');

      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });

  describe('dismissing', () => {
    it('calls onDismiss once and never onConfirm when Keep Trade is clicked', async () => {
      const { user, onConfirm, onDismiss } = setup();

      await user.click(keepButton());

      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('calls onDismiss once and never onConfirm on Escape', async () => {
      const { user, onConfirm, onDismiss } = setup();

      await user.keyboard('{Escape}');

      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('stops listening for Escape once unmounted', async () => {
      const { user, onDismiss, view } = setup();
      view.unmount();

      await user.keyboard('{Escape}');

      expect(onDismiss).not.toHaveBeenCalled();
    });
  });

  describe('confirming', () => {
    it('calls onConfirm once and not onDismiss when Cancel Trade is clicked', async () => {
      const { user, onConfirm, onDismiss } = setup();

      await user.click(cancelButton());

      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('locks the dialog while the cancel is pending, then unlocks when it resolves', async () => {
      const pending = deferred();
      const { user, onConfirm, onDismiss } = setup(vi.fn(() => pending.promise));

      await user.click(cancelButton());

      const busy = screen.getByRole('button', { name: 'Cancelling…' });
      expect(busy).toBeDisabled();
      expect(keepButton()).toBeDisabled();

      await user.click(keepButton());
      await user.click(busy);
      await user.keyboard('{Escape}');
      expect(onDismiss).not.toHaveBeenCalled();
      expect(onConfirm).toHaveBeenCalledTimes(1);

      pending.resolve();

      await waitFor(() => expect(cancelButton()).toBeEnabled());
      expect(keepButton()).toBeEnabled();
      await user.keyboard('{Escape}');
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('unlocks the dialog when the cancel rejects', async () => {
      const pending = deferred();
      const { user, onDismiss } = setup(vi.fn(() => pending.promise));

      await user.click(cancelButton());
      expect(keepButton()).toBeDisabled();

      pending.reject(new Error('boom'));

      await waitFor(() => expect(cancelButton()).toBeEnabled());
      await user.click(keepButton());
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });
});
