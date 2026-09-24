import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { Trade } from '@fusion-blotter/shared';
import { TradeGrid } from '../src/components/TradeGrid.js';

type GridProps = ComponentProps<typeof TradeGrid>;

const trade: Trade = {
  id: 'trade-1',
  tradeId: 'TRD-100001',
  symbol: 'AAPL',
  side: 'BUY',
  quantity: 100,
  price: 189.5,
  trader: 'jdoe',
  book: 'EQ-LON-01',
  counterparty: 'GOLDMAN',
  tradeTimestamp: new Date('2026-01-01').toISOString(),
  status: 'ACTIVE',
  createdAt: new Date('2026-01-01').toISOString(),
  updatedAt: new Date('2026-01-01').toISOString(),
};

const makeTrade = (overrides: Partial<Trade>): Trade => ({ ...trade, ...overrides });

// Every column puts these four in a different order, and none of those orders is the input order
// or the default (timestamp desc) order, so a sort that didn't happen can't pass by accident.
const tradeA = makeTrade({
  id: 'a',
  tradeId: 'TRD-100002',
  symbol: 'MSFT',
  side: 'BUY',
  quantity: 50,
  price: 189.5,
  trader: 'jdoe',
  book: 'EQ-TKY-01',
  counterparty: 'BARCLAYS',
  tradeTimestamp: '2026-01-02T09:00:00.000Z',
  status: 'CANCELLED',
});
const tradeB = makeTrade({
  id: 'b',
  tradeId: 'TRD-100004',
  symbol: 'AAPL',
  side: 'SELL',
  quantity: 500,
  price: 99,
  trader: 'bkhan',
  book: 'EQ-HK-01',
  counterparty: 'GOLDMAN',
  tradeTimestamp: '2026-01-04T09:00:00.000Z',
  status: 'ACTIVE',
});
const tradeC = makeTrade({
  id: 'c',
  tradeId: 'TRD-100003',
  symbol: 'TSLA',
  side: 'SELL',
  quantity: 250,
  price: 10.1234,
  trader: 'mlee',
  book: 'EQ-LON-01',
  counterparty: 'UBS',
  tradeTimestamp: '2026-01-01T09:00:00.000Z',
  status: 'ACTIVE',
});
const tradeD = makeTrade({
  id: 'd',
  tradeId: 'TRD-100001',
  symbol: 'NVDA',
  side: 'BUY',
  quantity: 1000,
  price: 1234.5,
  trader: 'asmith',
  book: 'EQ-NY-01',
  counterparty: 'CITI',
  tradeTimestamp: '2026-01-03T09:00:00.000Z',
  status: 'CANCELLED',
});
const trades = [tradeA, tradeB, tradeC, tradeD];
const newestFirst = [tradeB, tradeD, tradeA, tradeC].map((t) => t.tradeId);
const oldestFirst = [...newestFirst].reverse();

const columnNames = [
  'Trade ID',
  'Symbol',
  'Side',
  'Quantity',
  'Price',
  'Trader',
  'Book',
  'Counterparty',
  'Timestamp',
  'Status',
  'Actions',
];

function renderGrid(gridTrades: Trade[], overrides: Partial<GridProps> = {}) {
  const props: GridProps = {
    trades: gridTrades,
    isLoading: false,
    onAmend: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  const view = render(<TradeGrid {...props} />);
  const rerenderWith = (next: Partial<GridProps>) =>
    view.rerender(<TradeGrid {...props} {...next} />);
  return { ...view, props, rerenderWith };
}

const header = (name: string) => screen.getByRole('columnheader', { name });
const clickHeader = (name: string, init?: MouseEventInit) =>
  fireEvent.click(screen.getByRole('button', { name }), init);
const bodyRows = () => within(screen.getAllByRole('rowgroup')[1]!).getAllByRole('row');
const columnValues = (name: string) => {
  const index = screen.getAllByRole('columnheader').indexOf(header(name));
  return bodyRows().map((row) => within(row).getAllByRole('cell')[index]!.textContent);
};
const rowIds = () => columnValues('Trade ID');
const rowOf = (tradeId: string) => screen.getByText(tradeId).closest('tr')!;
const sortedHeaders = () =>
  screen.getAllByRole('columnheader').filter((th) => th.hasAttribute('aria-sort'));

type Direction = 'ascending' | 'descending';

function expectSortedBy(name: string, direction: Direction) {
  expect(header(name)).toHaveAttribute('aria-sort', direction);
  expect(sortedHeaders()).toEqual([header(name)]);
}

describe('TradeGrid', () => {
  describe('states', () => {
    it('shows a loading message and no table while loading', () => {
      renderGrid([], { isLoading: true });
      expect(screen.getByText('Loading trades…')).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('shows an empty state and no table when there are no trades', () => {
      renderGrid([]);
      expect(screen.getByText('No trades match the current filters.')).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  describe('columns', () => {
    it('renders the 10 documented columns and Actions, in order', () => {
      renderGrid([trade]);
      expect(screen.getByRole('table', { name: 'Trade blotter' })).toBeInTheDocument();
      expect(screen.getAllByRole('columnheader')).toEqual(columnNames.map((name) => header(name)));
    });

    it('renders every field of a trade in its own column', () => {
      renderGrid([trade]);
      const expected: Record<string, string> = {
        'Trade ID': 'TRD-100001',
        Symbol: 'AAPL',
        Side: 'BUY',
        Quantity: '100',
        Price: '$189.50',
        Trader: 'jdoe',
        Book: 'EQ-LON-01',
        Counterparty: 'GOLDMAN',
        // Rendered in the viewer's locale and timezone, so compare against the same conversion.
        Timestamp: new Date(trade.tradeTimestamp).toLocaleString(),
        Status: 'ACTIVE',
      };
      for (const [name, value] of Object.entries(expected)) {
        expect(columnValues(name)).toEqual([value]);
      }
    });

    it.each([
      [189.5, '$189.50'],
      [100, '$100.00'],
      [1234.5, '$1,234.50'],
      [10.1234, '$10.1234'],
      [10.1249, '$10.1249'],
    ])('formats price %d as %s (up to the stored 4dp)', (price, formatted) => {
      renderGrid([makeTrade({ price })]);
      expect(columnValues('Price')).toEqual([formatted]);
    });
  });

  describe('styling', () => {
    it('gives BUY and SELL distinct side badges', () => {
      renderGrid(trades);
      const buy = within(rowOf(tradeA.tradeId)).getByText('BUY');
      const sell = within(rowOf(tradeB.tradeId)).getByText('SELL');
      expect(buy).toHaveClass('bg-buy-bg', 'text-buy');
      expect(buy).not.toHaveClass('bg-sell-bg', 'text-sell');
      expect(sell).toHaveClass('bg-sell-bg', 'text-sell');
      expect(sell).not.toHaveClass('bg-buy-bg', 'text-buy');
    });

    it('dims cancelled rows and only cancelled rows', () => {
      renderGrid(trades);
      for (const { tradeId, status } of trades) {
        if (status === 'CANCELLED') expect(rowOf(tradeId)).toHaveClass('opacity-50');
        else expect(rowOf(tradeId)).not.toHaveClass('opacity-50');
      }
    });
  });

  describe('row actions', () => {
    it('hides Amend/Cancel on cancelled rows and shows them on active rows', () => {
      renderGrid(trades);
      for (const { tradeId, status } of trades) {
        const buttons = within(rowOf(tradeId)).queryAllByRole('button');
        if (status === 'CANCELLED') expect(buttons).toEqual([]);
        else expect(buttons.map((b) => b.textContent)).toEqual(['Amend', 'Cancel']);
      }
    });

    it('calls onAmend once with that row’s trade', () => {
      const { props } = renderGrid(trades);
      fireEvent.click(within(rowOf(tradeB.tradeId)).getByRole('button', { name: 'Amend' }));
      expect(props.onAmend).toHaveBeenCalledTimes(1);
      expect(vi.mocked(props.onAmend).mock.calls[0]![0]).toBe(tradeB);
      expect(props.onCancel).not.toHaveBeenCalled();
    });

    it('calls onCancel once with that row’s trade', () => {
      const { props } = renderGrid(trades);
      fireEvent.click(within(rowOf(tradeC.tradeId)).getByRole('button', { name: 'Cancel' }));
      expect(props.onCancel).toHaveBeenCalledTimes(1);
      expect(vi.mocked(props.onCancel).mock.calls[0]![0]).toBe(tradeC);
      expect(props.onAmend).not.toHaveBeenCalled();
    });

    it('keeps each row’s actions bound to its own trade after a re-sort', () => {
      const { props } = renderGrid(trades);
      clickHeader('Symbol');
      expect(rowIds()).toEqual([tradeB, tradeA, tradeD, tradeC].map((t) => t.tradeId));
      const [first, , , last] = bodyRows();
      fireEvent.click(within(first!).getByRole('button', { name: 'Amend' }));
      fireEvent.click(within(last!).getByRole('button', { name: 'Cancel' }));
      expect(vi.mocked(props.onAmend).mock.calls).toEqual([[tradeB]]);
      expect(vi.mocked(props.onCancel).mock.calls).toEqual([[tradeC]]);
    });

    it('uses the latest onAmend/onCancel after the parent re-renders with new ones', () => {
      const { props, rerenderWith } = renderGrid(trades);
      const next = { onAmend: vi.fn(), onCancel: vi.fn() };
      rerenderWith(next);
      const row = within(rowOf(tradeB.tradeId));
      fireEvent.click(row.getByRole('button', { name: 'Amend' }));
      fireEvent.click(row.getByRole('button', { name: 'Cancel' }));
      expect(next.onAmend).toHaveBeenCalledWith(tradeB);
      expect(next.onCancel).toHaveBeenCalledWith(tradeB);
      expect(props.onAmend).not.toHaveBeenCalled();
      expect(props.onCancel).not.toHaveBeenCalled();
    });
  });

  describe('sorting', () => {
    it('sorts by timestamp, newest first, by default', () => {
      renderGrid(trades);
      expect(rowIds()).toEqual(newestFirst);
      expectSortedBy('Timestamp', 'descending');
    });

    it('toggles Timestamp to ascending and back, never to unsorted', () => {
      renderGrid(trades);
      clickHeader('Timestamp');
      expect(rowIds()).toEqual(oldestFirst);
      expectSortedBy('Timestamp', 'ascending');
      clickHeader('Timestamp');
      expect(rowIds()).toEqual(newestFirst);
      expectSortedBy('Timestamp', 'descending');
      clickHeader('Timestamp');
      expect(rowIds()).toEqual(oldestFirst);
      expectSortedBy('Timestamp', 'ascending');
    });

    // Text columns start ascending, number columns descending (TanStack's auto direction).
    // Side and Status have ties, so these assert the column's values, not row identity.
    const sortCases: [name: string, first: Direction, ascending: string[]][] = [
      ['Trade ID', 'ascending', ['TRD-100001', 'TRD-100002', 'TRD-100003', 'TRD-100004']],
      ['Symbol', 'ascending', ['AAPL', 'MSFT', 'NVDA', 'TSLA']],
      ['Side', 'ascending', ['BUY', 'BUY', 'SELL', 'SELL']],
      ['Quantity', 'descending', ['50', '250', '500', '1000']],
      ['Price', 'descending', ['$10.1234', '$99.00', '$189.50', '$1,234.50']],
      ['Trader', 'ascending', ['asmith', 'bkhan', 'jdoe', 'mlee']],
      ['Book', 'ascending', ['EQ-HK-01', 'EQ-LON-01', 'EQ-NY-01', 'EQ-TKY-01']],
      ['Counterparty', 'ascending', ['BARCLAYS', 'CITI', 'GOLDMAN', 'UBS']],
      ['Status', 'ascending', ['ACTIVE', 'ACTIVE', 'CANCELLED', 'CANCELLED']],
    ];

    it.each(sortCases)(
      '%s: first click sorts %s, then toggles without clearing',
      (name, first, ascending) => {
        renderGrid(trades);
        const descending = [...ascending].reverse();
        const second: Direction = first === 'ascending' ? 'descending' : 'ascending';
        const valuesFor = (direction: Direction) =>
          direction === 'ascending' ? ascending : descending;

        for (const direction of [first, second, first]) {
          clickHeader(name);
          expect(columnValues(name)).toEqual(valuesFor(direction));
          expectSortedBy(name, direction);
        }
      },
    );

    it('starts Timestamp newest first when returning to it from another column', () => {
      renderGrid(trades);
      clickHeader('Symbol');
      expectSortedBy('Symbol', 'ascending');
      clickHeader('Timestamp');
      expect(rowIds()).toEqual(newestFirst);
      expectSortedBy('Timestamp', 'descending');
    });

    it('replaces the sort on shift-click instead of adding a second one', () => {
      renderGrid(trades);
      clickHeader('Symbol');
      clickHeader('Price', { shiftKey: true });
      expect(columnValues('Price')).toEqual(['$1,234.50', '$189.50', '$99.00', '$10.1234']);
      expectSortedBy('Price', 'descending');
    });

    it('renders the Actions header as plain text, not a sort button', () => {
      renderGrid(trades);
      expect(screen.queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument();
      fireEvent.click(header('Actions'));
      expect(header('Actions')).not.toHaveAttribute('aria-sort');
      expect(rowIds()).toEqual(newestFirst);
    });

    it('hides the sort arrow from assistive tech and shows it only on the sorted column', () => {
      renderGrid(trades);
      const timestamp = screen.getByRole('button', { name: 'Timestamp' });
      expect(within(timestamp).getByText('▼')).toHaveAttribute('aria-hidden', 'true');
      clickHeader('Timestamp');
      expect(within(timestamp).getByText('▲')).toHaveAttribute('aria-hidden', 'true');
      expect(
        within(screen.getByRole('button', { name: 'Symbol' })).queryByText(/[▲▼]/),
      ).not.toBeInTheDocument();
    });
  });

  // useRealtimeTrades reconciles events into the cache without regard to sort order (retro #77):
  // a created trade is prepended. The grid re-sorts whatever arrives. Here a rerender with a
  // prepended trade stands in for that cache update.
  describe('live data', () => {
    const newest = makeTrade({
      id: 'e',
      tradeId: 'TRD-100005',
      symbol: 'AMZN',
      tradeTimestamp: '2026-01-05T09:00:00.000Z',
    });

    it('places a prepended trade by the default sort, not at the top', () => {
      const backdated = makeTrade({
        id: 'f',
        tradeId: 'TRD-100006',
        tradeTimestamp: '2026-01-02T12:00:00.000Z',
      });
      const { rerenderWith } = renderGrid(trades);
      rerenderWith({ trades: [backdated, ...trades] });
      expect(rowIds()).toEqual([
        tradeB.tradeId,
        tradeD.tradeId,
        backdated.tradeId,
        tradeA.tradeId,
        tradeC.tradeId,
      ]);
    });

    it('keeps the user’s sort when new data arrives', () => {
      const { rerenderWith } = renderGrid(trades);
      clickHeader('Symbol');
      rerenderWith({ trades: [newest, ...trades] });
      expect(columnValues('Symbol')).toEqual(['AAPL', 'AMZN', 'MSFT', 'NVDA', 'TSLA']);
      expectSortedBy('Symbol', 'ascending');
    });

    it('keeps focus on the same trade’s button when new data reorders the rows', () => {
      const { rerenderWith } = renderGrid(trades);
      const amendB = within(rowOf(tradeB.tradeId)).getByRole('button', { name: 'Amend' });
      amendB.focus();
      rerenderWith({ trades: [newest, ...trades] });
      expect(rowIds()[0]).toBe(newest.tradeId);
      expect(document.activeElement).toBe(amendB);
      expect(rowOf(tradeB.tradeId)).toContainElement(amendB);
    });

    it('dims a trade and drops its actions when it arrives cancelled', () => {
      const { rerenderWith } = renderGrid(trades);
      expect(within(rowOf(tradeB.tradeId)).getAllByRole('button')).toHaveLength(2);
      rerenderWith({
        trades: trades.map((t) => (t === tradeB ? { ...t, status: 'CANCELLED' as const } : t)),
      });
      expect(rowOf(tradeB.tradeId)).toHaveClass('opacity-50');
      expect(within(rowOf(tradeB.tradeId)).queryAllByRole('button')).toEqual([]);
    });
  });

  describe('readOnly', () => {
    it('omits the Actions column and every row button, keeping the other columns', () => {
      renderGrid(trades, { readOnly: true });

      expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual(
        columnNames
          .filter((name) => name !== 'Actions')
          .map((name) => expect.stringContaining(name)),
      );
      for (const row of bodyRows()) expect(within(row).queryAllByRole('button')).toEqual([]);
    });

    it('still sorts', () => {
      renderGrid(trades, { readOnly: true });
      clickHeader('Symbol');
      expectSortedBy('Symbol', 'ascending');
    });

    it('brings the actions back when readOnly is lifted', () => {
      const { rerenderWith } = renderGrid(trades, { readOnly: true });
      rerenderWith({ readOnly: false });
      expect(header('Actions')).toBeInTheDocument();
      expect(within(rowOf(tradeB.tradeId)).getAllByRole('button')).toHaveLength(2);
    });
  });
});
