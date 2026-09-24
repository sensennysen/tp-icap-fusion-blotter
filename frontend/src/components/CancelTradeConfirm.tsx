import { useEffect, useId, useRef, useState } from 'react';
import type { Trade } from '@fusion-blotter/shared';

interface CancelTradeConfirmProps {
  trade: Trade;
  onConfirm: () => Promise<void>;
  onDismiss: () => void;
}

export function CancelTradeConfirm({ trade, onConfirm, onDismiss }: CancelTradeConfirmProps) {
  const titleId = useId();
  const descriptionId = useId();
  const keepRef = useRef<HTMLButtonElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    // Focus the least destructive action, so a stray Enter keeps the trade.
    keepRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSubmittingRef.current) onDismissRef.current();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const confirm = async () => {
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      await onConfirm();
    } catch {
      // The caller reports failures (the page toasts); just unlock the dialog.
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl"
      >
        <h2 id={titleId} className="text-lg font-semibold text-slate-900">
          Cancel {trade.tradeId}?
        </h2>
        <p id={descriptionId} className="mt-2 text-sm text-slate-600">
          This will mark the trade as cancelled. This action cannot be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            ref={keepRef}
            type="button"
            onClick={onDismiss}
            disabled={isSubmitting}
            className="rounded px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            Keep Trade
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={isSubmitting}
            className="rounded bg-sell px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {isSubmitting ? 'Cancelling…' : 'Cancel Trade'}
          </button>
        </div>
      </div>
    </div>
  );
}
