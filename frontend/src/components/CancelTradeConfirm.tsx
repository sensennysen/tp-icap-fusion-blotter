import { useState } from 'react';
import type { Trade } from '@fusion-blotter/shared';

interface CancelTradeConfirmProps {
  trade: Trade;
  onConfirm: () => Promise<void>;
  onDismiss: () => void;
}

export function CancelTradeConfirm({ trade, onConfirm, onDismiss }: CancelTradeConfirmProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const confirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cancel-confirm-title"
        className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl"
      >
        <h2 id="cancel-confirm-title" className="text-lg font-semibold text-slate-900">
          Cancel {trade.tradeId}?
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          This will mark the trade as cancelled. This action cannot be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Keep Trade
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={isSubmitting}
            className="rounded bg-sell px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Cancel Trade
          </button>
        </div>
      </div>
    </div>
  );
}
