import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { Trade } from '@fusion-blotter/shared';
import { TradeGrid, VIRTUALIZE_THRESHOLD } from '../src/components/TradeGrid.js';

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

// jsdom has no layout, so every element measures 0px tall and a virtualizer would render nothing.
// virtual-core reads both the viewport and each rendered row from `offsetHeight` (and skips
// observing, since jsdom has no ResizeObserver), so the stub gives rows and the scroll container
// their own heights. ROW_PX matches the grid's estimate; a test that changes rowPx proves rows are
// measured rather than assumed.
const VIEWPORT_PX = 600;
const ROW_PX = 37;
let rowPx = ROW_PX;

// Trade i has timestamp order i (default sort puts i=count-1 first) and a quantity that is a
// permutation of 1..count unrelated to that order, so a sort over the whole dataset is visible.
const manyTrades = (count: number) =>
  Array.from({ length: count }, (_, i) =>
    makeTrade({
      id: `bulk-${i}`,
      tradeId: `TRD-${String(200000 + i)}`,
      quantity: ((i * 7919) % count) + 1,
      tradeTimestamp: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(),
    }),
  );

const spacerHeight = (testId: string) =>
  parseFloat(screen.getByTestId(testId).querySelector('td')!.style.height);

describe('TradeGrid virtualization', () => {
  let offsetHeight: PropertyDescriptor | undefined;

  beforeEach(() => {
    offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        return this.tagName === 'TR' ? rowPx : VIEWPORT_PX;
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetHeight!);
    rowPx = ROW_PX;
  });

  it('renders every row at the threshold, with no scroll container or spacers', () => {
    renderGrid(manyTrades(VIRTUALIZE_THRESHOLD));
    expect(bodyRows()).toHaveLength(VIRTUALIZE_THRESHOLD);
    expect(screen.queryByTestId('virtual-spacer-top')).not.toBeInTheDocument();
    expect(screen.getByRole('table').parentElement).not.toHaveClass('overflow-auto');
  });

  it('renders only a window of rows above the threshold', () => {
    renderGrid(manyTrades(VIRTUALIZE_THRESHOLD + 1));
    const rendered = bodyRows().length;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(VIRTUALIZE_THRESHOLD + 1);
  });

  it('windows 1,000 rows, with spacers standing in for the rest', () => {
    renderGrid(manyTrades(1000));
    const rendered = bodyRows().length;
    // The viewport's rows plus overscan, not the whole dataset.
    expect(rendered).toBeGreaterThanOrEqual(Math.ceil(VIEWPORT_PX / ROW_PX));
    expect(rendered).toBeLessThan(50);
    expect(rowIds()[0]).toBe('TRD-200999');
    expect(spacerHeight('virtual-spacer-top')).toBe(0);
    expect(spacerHeight('virtual-spacer-bottom')).toBe((1000 - rendered) * ROW_PX);
    // Spacers are aria-hidden and span the full width, so the table's structure is unchanged.
    expect(screen.getByTestId('virtual-spacer-top')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('virtual-spacer-top').querySelector('td')).toHaveAttribute(
      'colspan',
      String(screen.getAllByRole('columnheader').length),
    );
  });

  it('scroll container scrolls vertically and keeps the header sticky', () => {
    renderGrid(manyTrades(1000));
    expect(screen.getByRole('table').parentElement).toHaveClass('overflow-auto', 'max-h-[70vh]');
    expect(screen.getAllByRole('rowgroup')[0]).toHaveClass('sticky', 'top-0');
  });

  it('sorts the whole dataset, not just the rendered window', () => {
    renderGrid(manyTrades(1000));
    clickHeader('Quantity');
    expectSortedBy('Quantity', 'descending');
    expect(columnValues('Quantity').slice(0, 3)).toEqual(['1000', '999', '998']);
    clickHeader('Quantity');
    expect(columnValues('Quantity').slice(0, 3)).toEqual(['1', '2', '3']);
  });

  it('renders the rows at the scroll position after a scroll', () => {
    renderGrid(manyTrades(1000));
    const scroller = screen.getByRole('table').parentElement!;
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, value: 500 * ROW_PX });
    fireEvent.scroll(scroller);

    const ids = rowIds();
    // Default sort is newest first, so row 500 is trade i=499.
    expect(ids).toContain('TRD-200499');
    expect(ids).not.toContain('TRD-200999');
    const top = spacerHeight('virtual-spacer-top');
    expect(top).toBeGreaterThan(0);
    expect(top + ids.length * ROW_PX + spacerHeight('virtual-spacer-bottom')).toBe(1000 * ROW_PX);
  });

  it('keeps a live prepend sorted into place rather than on top', () => {
    const trades = manyTrades(1000);
    const { rerenderWith } = renderGrid(trades);
    const backdated = makeTrade({
      id: 'late',
      tradeId: 'TRD-300000',
      tradeTimestamp: '2025-06-01T00:00:00.000Z',
    });
    rerenderWith({ trades: [backdated, ...trades] });
    expect(rowIds()[0]).toBe('TRD-200999');
    expect(screen.queryByText('TRD-300000')).not.toBeInTheDocument();
    expect(spacerHeight('virtual-spacer-bottom')).toBe((1001 - bodyRows().length) * ROW_PX);
  });

  it('sizes rendered rows by measurement, not the estimate', () => {
    const windowAt = (px: number) => {
      rowPx = px;
      const { unmount } = renderGrid(manyTrades(1000));
      const rendered = bodyRows().length;
      const total =
        spacerHeight('virtual-spacer-top') + rendered * px + spacerHeight('virtual-spacer-bottom');
      unmount();
      return { rendered, total };
    };
    const single = windowAt(ROW_PX);
    // Wrapped rows (Trade ID, Book, Timestamp on two lines) are taller than the estimate: fewer
    // of them fill the viewport, and the scrollable height grows past count × estimate.
    const wrapped = windowAt(57);
    expect(wrapped.rendered).toBeLessThan(single.rendered);
    expect(single.total).toBe(1000 * ROW_PX);
    expect(wrapped.total).toBeGreaterThan(1000 * ROW_PX);
  });

  it('virtualizes a read-only grid, with spacers spanning only its columns', () => {
    renderGrid(manyTrades(1000), { readOnly: true });
    expect(bodyRows().length).toBeLessThan(50);
    expect(screen.getByTestId('virtual-spacer-bottom').querySelector('td')).toHaveAttribute(
      'colspan',
      '10',
    );
  });
});
