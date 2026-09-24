import { useMemo, useRef, useState } from 'react';
import {
  createColumnHelper,
  createSortedRowModel,
  flexRender,
  rowSortingFeature,
  sortFns,
  tableFeatures,
  useTable,
  type Row,
  type SortingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Trade } from '@fusion-blotter/shared';

interface TradeGridProps {
  trades: Trade[];
  isLoading: boolean;
  onAmend: (trade: Trade) => void;
  onCancel: (trade: Trade) => void;
  // Drops the Actions column entirely (e.g. for a viewer session).
  readOnly?: boolean;
}

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns,
});

const columnHelper = createColumnHelper<typeof features, Trade>();

// Prices are stored as Decimal(12,4); show up to 4dp so an amend in the 3rd/4th place is visible.
const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const EMPTY_TRADES: Trade[] = [];

// Above this many rows only the visible window is rendered. Below it every row is in the DOM:
// small blotters render fine without virtualization (ADR-004), and nothing scrolls internally.
export const VIRTUALIZE_THRESHOLD = 200;
// A single-line row (py-2 cells + text-sm). Only a first guess: Trade ID, Book and Timestamp wrap
// at common widths, so rendered rows are measured and the real height replaces this.
const ESTIMATED_ROW_PX = 37;

export function TradeGrid({
  trades,
  isLoading,
  onAmend,
  onCancel,
  readOnly = false,
}: TradeGridProps) {
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
          // ISO strings would auto-start ascending; newest-first matches the default sort.
          sortDescFirst: true,
          cell: (info) => new Date(info.getValue()).toLocaleString(),
        }),
        columnHelper.accessor('status', { header: 'Status' }),
        ...(!readOnly
          ? [
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
            ]
          : []),
      ]),
    [onAmend, onCancel, readOnly],
  );

  const table = useTable({
    features,
    columns,
    data: trades.length > 0 ? trades : EMPTY_TRADES,
    getRowId: (row) => row.id,
    state: { sorting },
    onSortingChange: setSorting,
    // Headers toggle asc/desc on a single column; there is no "unsorted" third click.
    enableSortingRemoval: false,
    enableMultiSort: false,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const rows = table.getRowModel().rows;
  const virtualize = rows.length > VIRTUALIZE_THRESHOLD;
  // Hooks can't be conditional, so the virtualizer always exists and is disabled below the threshold.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_PX,
    overscan: 10,
    enabled: virtualize,
  });

  if (isLoading) {
    return <p className="p-4 text-sm text-slate-500">Loading trades…</p>;
  }

  if (trades.length === 0) {
    return <p className="p-4 text-sm text-slate-500">No trades match the current filters.</p>;
  }

  // `virtualIndex` is set only in the virtualized path, where the virtualizer measures the row.
  const renderRow = (row: Row<typeof features, Trade>, virtualIndex?: number) => {
    const trade = row.original;
    return (
      <tr
        key={row.id}
        ref={virtualIndex === undefined ? undefined : virtualizer.measureElement}
        data-index={virtualIndex}
        className={`border-b border-slate-100 ${trade.status === 'CANCELLED' ? 'opacity-50' : ''}`}
      >
        {row.getAllCells().map((cell) => (
          <td key={cell.id} className="px-3 py-2">
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        ))}
      </tr>
    );
  };

  // Spacer rows stand in for the off-screen rows, so the table keeps native column layout.
  const renderVirtualRows = () => {
    const items = virtualizer.getVirtualItems();
    const paddingTop = items[0]?.start ?? 0;
    const paddingBottom = virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0);
    return (
      <>
        <tr aria-hidden="true" data-testid="virtual-spacer-top">
          <td colSpan={columns.length} style={{ height: paddingTop, padding: 0 }} />
        </tr>
        {items.map((item) => renderRow(rows[item.index]!, item.index))}
        <tr aria-hidden="true" data-testid="virtual-spacer-bottom">
          <td colSpan={columns.length} style={{ height: paddingBottom, padding: 0 }} />
        </tr>
      </>
    );
  };

  const tableElement = (
    <table className="w-full border-collapse text-left text-sm" aria-label="Trade blotter">
      <thead className={virtualize ? 'sticky top-0 z-10 bg-white' : undefined}>
        {table.getHeaderGroups().map((headerGroup) => (
          <tr key={headerGroup.id} className="border-b border-slate-200">
            {headerGroup.headers.map((header) => {
              const sorted = header.column.getIsSorted();
              return (
                <th
                  key={header.id}
                  scope="col"
                  aria-sort={
                    sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined
                  }
                  className="px-3 py-2 font-semibold text-slate-600"
                >
                  {header.column.getCanSort() ? (
                    <button
                      type="button"
                      className="flex items-center gap-1"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {sorted && <span aria-hidden="true">{sorted === 'asc' ? '▲' : '▼'}</span>}
                    </button>
                  ) : (
                    flexRender(header.column.columnDef.header, header.getContext())
                  )}
                </th>
              );
            })}
          </tr>
        ))}
      </thead>
      <tbody>{virtualize ? renderVirtualRows() : rows.map((row) => renderRow(row))}</tbody>
    </table>
  );

  if (!virtualize) return tableElement;

  return (
    <div ref={scrollRef} className="max-h-[70vh] overflow-auto">
      {tableElement}
    </div>
  );
}
