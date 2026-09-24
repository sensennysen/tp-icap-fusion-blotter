import type { ChangeEvent } from 'react';
import { sideSchema, tradeStatusSchema, type TradeListQuery } from '@fusion-blotter/shared';

interface TradeFiltersProps {
  filters: TradeListQuery;
  onChange: (filters: TradeListQuery) => void;
}

function toUndefined(value: string): string | undefined {
  return value === '' ? undefined : value;
}

export function TradeFilters({ filters, onChange }: TradeFiltersProps) {
  // Raw text is kept as typed (trimming here would swallow the space in "j doe" mid-typing);
  // useTrades normalises it before it becomes a query key or request.
  const handleTextChange =
    (field: 'symbol' | 'trader') => (event: ChangeEvent<HTMLInputElement>) => {
      onChange({ ...filters, [field]: toUndefined(event.target.value) });
    };

  // "All" ('') parses to undefined, so a cleared select omits the param.
  const handleSideChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange({ ...filters, side: sideSchema.safeParse(event.target.value).data });
  };

  const handleStatusChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange({ ...filters, status: tradeStatusSchema.safeParse(event.target.value).data });
  };

  return (
    <fieldset className="flex flex-wrap items-end gap-3">
      <legend className="sr-only">Filter trades</legend>

      <div className="flex flex-col">
        <label htmlFor="filter-symbol" className="text-xs font-medium text-slate-600">
          Symbol
        </label>
        <input
          id="filter-symbol"
          type="text"
          value={filters.symbol ?? ''}
          onChange={handleTextChange('symbol')}
          placeholder="AAPL"
          className="rounded border border-slate-300 px-2 py-1 text-sm"
        />
      </div>

      <div className="flex flex-col">
        <label htmlFor="filter-trader" className="text-xs font-medium text-slate-600">
          Trader
        </label>
        <input
          id="filter-trader"
          type="text"
          value={filters.trader ?? ''}
          onChange={handleTextChange('trader')}
          placeholder="jdoe"
          className="rounded border border-slate-300 px-2 py-1 text-sm"
        />
      </div>

      <div className="flex flex-col">
        <label htmlFor="filter-side" className="text-xs font-medium text-slate-600">
          Side
        </label>
        <select
          id="filter-side"
          value={filters.side ?? ''}
          onChange={handleSideChange}
          className="rounded border border-slate-300 px-2 py-1 text-sm"
        >
          <option value="">All</option>
          <option value="BUY">Buy</option>
          <option value="SELL">Sell</option>
        </select>
      </div>

      <div className="flex flex-col">
        <label htmlFor="filter-status" className="text-xs font-medium text-slate-600">
          Status
        </label>
        <select
          id="filter-status"
          value={filters.status ?? ''}
          onChange={handleStatusChange}
          className="rounded border border-slate-300 px-2 py-1 text-sm"
        >
          <option value="">All</option>
          <option value="ACTIVE">Active</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>
    </fieldset>
  );
}
