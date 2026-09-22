import { useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import type { Trade, TradeListQuery } from '@fusion-blotter/shared';
import { TradeGrid } from '../components/TradeGrid.js';
import { TradeFilters } from '../components/TradeFilters.js';
import { CreateTradeModal } from '../components/CreateTradeModal.js';
import { AmendTradeModal } from '../components/AmendTradeModal.js';
import { CancelTradeConfirm } from '../components/CancelTradeConfirm.js';
import { useTrades } from '../hooks/useTrades.js';
import { useRealtimeTrades } from '../hooks/useRealtimeTrades.js';
import { useToast } from '../components/Toast/ToastProvider.js';

export function TradeBlotterPage() {
  const [filters, setFilters] = useState<TradeListQuery>({});
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [amendTarget, setAmendTarget] = useState<Trade | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Trade | null>(null);

  const { trades, isLoading, refetch, createTrade, amendTrade, cancelTrade } = useTrades(filters);
  const { showToast } = useToast();

  useRealtimeTrades(filters);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="mb-4 text-xl font-semibold text-slate-900">Trade Blotter</h1>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <TradeFilters filters={filters} onChange={setFilters} />

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => refetch()}
            aria-label="Refresh trades"
            className="flex items-center gap-1 rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus size={16} />
            New Trade
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-slate-200 bg-white">
        <TradeGrid
          trades={trades}
          isLoading={isLoading}
          onAmend={setAmendTarget}
          onCancel={setCancelTarget}
        />
      </div>

      {isCreateOpen && (
        <CreateTradeModal
          onClose={() => setIsCreateOpen(false)}
          onSubmit={async (input) => {
            try {
              await createTrade.mutateAsync(input);
              showToast('success', 'Trade created');
            } catch {
              showToast('error', 'Failed to create trade');
            }
          }}
        />
      )}

      {amendTarget && (
        <AmendTradeModal
          trade={amendTarget}
          onClose={() => setAmendTarget(null)}
          onSubmit={async (input) => {
            try {
              await amendTrade.mutateAsync({ id: amendTarget.id, input });
              showToast('success', 'Trade amended');
            } catch {
              showToast('error', 'Failed to amend trade');
            }
          }}
        />
      )}

      {cancelTarget && (
        <CancelTradeConfirm
          trade={cancelTarget}
          onDismiss={() => setCancelTarget(null)}
          onConfirm={async () => {
            try {
              await cancelTrade.mutateAsync(cancelTarget.id);
              showToast('success', 'Trade cancelled');
            } catch {
              showToast('error', 'Failed to cancel trade');
            } finally {
              setCancelTarget(null);
            }
          }}
        />
      )}
    </main>
  );
}
