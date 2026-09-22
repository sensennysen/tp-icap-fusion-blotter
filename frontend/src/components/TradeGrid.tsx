import { useMemo, useState } from 'react';
import {
  createColumnHelper,
  createSortedRowModel,
  flexRender,
  rowSortingFeature,
  sortFns,
  tableFeatures,
  useTable,
  type SortingState,
} from '@tanstack/react-table';
import type { Trade } from '@fusion-blotter/shared';

interface TradeGridProps {
  trades: Trade[];
  isLoading: boolean;
  onAmend: (trade: Trade) => void;
  onCancel: (trade: Trade) => void;
}

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns,
});

const columnHelper = createColumnHelper<typeof features, Trade>();

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const EMPTY_TRADES: Trade[] = [];

export function TradeGrid({ trades, isLoading, onAmend, onCancel }: TradeGridProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'tradeTimestamp', desc: true }]);

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor('tradeId', { header: 'Trade ID' }),
        columnHelper.accessor('symbol', { header: 'Symbol' }),
        columnHelper.accessor('side', {
          header: 'Side',
          cell: (info) => (
            <span
              className={
                info.getValue() === 'BUY'
                  ? 'rounded px-2 py-0.5 text-xs font-semibold bg-buy-bg text-buy'
                  : 'rounded px-2 py-0.5 text-xs font-semibold bg-sell-bg text-sell'
              }
            >
              {info.getValue()}
            </span>
          ),
        }),
        columnHelper.accessor('quantity', { header: 'Quantity' }),
        columnHelper.accessor('price', {
          header: 'Price',
          cell: (info) => currencyFormatter.format(info.getValue()),
        }),
        columnHelper.accessor('trader', { header: 'Trader' }),
        columnHelper.accessor('book', { header: 'Book' }),
        columnHelper.accessor('counterparty', { header: 'Counterparty' }),
        columnHelper.accessor('tradeTimestamp', {
          header: 'Timestamp',
          sortFn: 'datetime',
          cell: (info) => new Date(info.getValue()).toLocaleString(),
        }),
        columnHelper.accessor('status', { header: 'Status' }),
        columnHelper.display({
          id: 'actions',
          header: 'Actions',
          cell: ({ row }) => {
            const trade = row.original;
            if (trade.status === 'CANCELLED') return null;
            return (
              <div className="flex gap-2">
                <button
                  type="button"
                  className="text-sm font-medium text-blue-600 hover:underline"
                  onClick={() => onAmend(trade)}
                >
                  Amend
                </button>
                <button
                  type="button"
                  className="text-sm font-medium text-sell hover:underline"
                  onClick={() => onCancel(trade)}
                >
                  Cancel
                </button>
              </div>
            );
          },
        }),
      ]),
    [onAmend, onCancel],
  );

  const table = useTable({
    features,
    columns,
    data: trades.length > 0 ? trades : EMPTY_TRADES,
    getRowId: (row) => row.id,
    state: { sorting },
    onSortingChange: setSorting,
  });

  if (isLoading) {
    return <p className="p-4 text-sm text-slate-500">Loading trades…</p>;
  }

  if (trades.length === 0) {
    return <p className="p-4 text-sm text-slate-500">No trades match the current filters.</p>;
  }

  return (
    <table className="w-full border-collapse text-left text-sm" aria-label="Trade blotter">
      <thead>
        {table.getHeaderGroups().map((headerGroup) => (
          <tr key={headerGroup.id} className="border-b border-slate-200">
            {headerGroup.headers.map((header) => (
              <th key={header.id} scope="col" className="px-3 py-2 font-semibold text-slate-600">
                <button
                  type="button"
                  className="flex items-center gap-1"
                  onClick={header.column.getToggleSortingHandler()}
                  disabled={!header.column.getCanSort()}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {{ asc: ' ▲', desc: ' ▼' }[header.column.getIsSorted() as string] ?? ''}
                </button>
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => {
          const trade = row.original;
          return (
            <tr
              key={row.id}
              className={`border-b border-slate-100 ${
                trade.status === 'CANCELLED' ? 'opacity-50' : ''
              }`}
            >
              {row.getAllCells().map((cell) => (
                <td key={cell.id} className="px-3 py-2">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
