import { useState } from 'react';
import { LogOut, Plus, RefreshCw } from 'lucide-react';
import type { AuthUser, Trade, TradeListQuery } from '@fusion-blotter/shared';
import { TradeGrid } from '../components/TradeGrid.js';
import { TradeFilters } from '../components/TradeFilters.js';
import { CreateTradeModal } from '../components/CreateTradeModal.js';
import { AmendTradeModal } from '../components/AmendTradeModal.js';
import { CancelTradeConfirm } from '../components/CancelTradeConfirm.js';
import { useTrades } from '../hooks/useTrades.js';
import { useRealtimeTrades } from '../hooks/useRealtimeTrades.js';
import { useToast } from '../components/Toast/ToastProvider.js';

interface TradeBlotterPageProps {
  user: AuthUser;
  onLogout: () => void;
}

export function TradeBlotterPage({ user, onLogout }: TradeBlotterPageProps) {
  // Viewers are read-only; the API would reject their mutations with 403.
  const canEdit = user.role === 'trader';
  const [filters, setFilters] = useState<TradeListQuery>({});
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [amendTarget, setAmendTarget] = useState<Trade | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Trade | null>(null);

  const { trades, isLoading, isError, refetch, createTrade, amendTrade, cancelTrade } =
    useTrades(filters);
  const { showToast } = useToast();

  useRealtimeTrades(filters);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Trade Blotter</h1>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span>
            Signed in as <span className="font-medium text-slate-900">{user.username}</span> (
            {user.role})
          </span>
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-1 rounded border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <TradeFilters filters={filters} onChange={setFilters} />

        <div className="flex gap-2">
          <button
            type="button"
            onClick={async () => {
              // refetch() resolves with the error instead of throwing.
              const result = await refetch();
              if (result.isError) showToast('error', 'Failed to refresh trades');
            }}
            aria-label="Refresh trades"
            className="flex items-center gap-1 rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus size={16} />
              New Trade
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-slate-200 bg-white">
        {isError && trades.length === 0 ? (
          // Without this a failed load would read as "No trades match the current filters".
          <p role="alert" className="p-4 text-sm text-sell">
            Couldn't load trades. Use Refresh to retry.
          </p>
        ) : (
          <TradeGrid
            trades={trades}
            isLoading={isLoading}
            onAmend={setAmendTarget}
            onCancel={setCancelTarget}
            readOnly={!canEdit}
          />
        )}
      </div>

      {isCreateOpen && (
        <CreateTradeModal
          onClose={() => setIsCreateOpen(false)}
          onSubmit={async (input) => {
            try {
              await createTrade.mutateAsync(input);
              showToast('success', 'Trade created');
            } catch (error) {
              showToast('error', 'Failed to create trade');
              // Rethrow so the modal stays open with the user's input.
              throw error;
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
            } catch (error) {
              showToast('error', 'Failed to amend trade');
              // Rethrow so the modal stays open with the user's input.
              throw error;
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
