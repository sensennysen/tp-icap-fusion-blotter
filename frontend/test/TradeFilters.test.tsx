import { useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TradeListQuery } from '@fusion-blotter/shared';
import { TradeFilters } from '../src/components/TradeFilters.js';
import { useTrades } from '../src/hooks/useTrades.js';

const symbolInput = () => screen.getByRole('textbox', { name: 'Symbol' });
const traderInput = () => screen.getByRole('textbox', { name: 'Trader' });
const sideSelect = () => screen.getByRole('combobox', { name: 'Side' });
const statusSelect = () => screen.getByRole('combobox', { name: 'Status' });

function renderFilters(filters: TradeListQuery = {}) {
  const onChange = vi.fn<(filters: TradeListQuery) => void>();
  const view = render(<TradeFilters filters={filters} onChange={onChange} />);
  return { ...view, onChange };
}

describe('TradeFilters controls', () => {
  it('renders the four labelled controls, empty by default', () => {
    renderFilters();

    expect(symbolInput()).toHaveValue('');
    expect(traderInput()).toHaveValue('');
    expect(sideSelect()).toHaveValue('');
    expect(statusSelect()).toHaveValue('');
    expect(screen.getByRole('group', { name: 'Filter trades' })).toBeInTheDocument();
  });

  it('offers All plus each enum value in the selects', () => {
    renderFilters();

    const options = (select: HTMLElement) =>
      Array.from((select as HTMLSelectElement).options).map((o) => [o.value, o.text]);
    expect(options(sideSelect())).toEqual([
      ['', 'All'],
      ['BUY', 'Buy'],
      ['SELL', 'Sell'],
    ]);
    expect(options(statusSelect())).toEqual([
      ['', 'All'],
      ['ACTIVE', 'Active'],
      ['CANCELLED', 'Cancelled'],
    ]);
  });

  it('reflects the current filters', () => {
    renderFilters({ symbol: 'AAPL', trader: 'jdoe', side: 'SELL', status: 'CANCELLED' });

    expect(symbolInput()).toHaveValue('AAPL');
    expect(traderInput()).toHaveValue('jdoe');
    expect(sideSelect()).toHaveValue('SELL');
    expect(statusSelect()).toHaveValue('CANCELLED');
  });

  const others: TradeListQuery = {
    symbol: 'MSFT',
    trader: 'asmith',
    side: 'BUY',
    status: 'ACTIVE',
    sort: 'price',
    order: 'asc',
  };

  it.each([
    ['symbol', () => symbolInput()],
    ['trader', () => traderInput()],
  ] as const)('typing in %s changes only that field', async (field, input) => {
    const user = userEvent.setup();
    const { onChange } = renderFilters(others);

    await user.type(input(), 'X');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({ ...others, [field]: `${others[field]}X` });
  });

  it.each([
    ['side', () => sideSelect(), 'SELL'],
    ['status', () => statusSelect(), 'CANCELLED'],
  ] as const)('selecting a %s changes only that field', async (field, select, value) => {
    const user = userEvent.setup();
    const { onChange } = renderFilters(others);

    await user.selectOptions(select(), value);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({ ...others, [field]: value });
  });

  it.each([
    ['symbol', () => symbolInput()],
    ['trader', () => traderInput()],
  ] as const)('clearing %s sets it to undefined, not an empty string', async (field, input) => {
    const user = userEvent.setup();
    const { onChange } = renderFilters(others);

    await user.clear(input());

    const next = onChange.mock.lastCall?.[0];
    expect(next).toEqual({ ...others, [field]: undefined });
    expect(next?.[field]).toBeUndefined();
  });

  it.each([
    ['side', () => sideSelect()],
    ['status', () => statusSelect()],
  ] as const)('choosing All for %s sets it to undefined', async (field, select) => {
    const user = userEvent.setup();
    const { onChange } = renderFilters(others);

    await user.selectOptions(select(), 'All');

    const next = onChange.mock.lastCall?.[0];
    expect(next).toEqual({ ...others, [field]: undefined });
    expect(next?.[field]).toBeUndefined();
  });

  it('keeps typed text as-is, so a space inside a name can be typed', async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilters({ trader: 'j' });

    await user.type(traderInput(), ' ');

    expect(onChange).toHaveBeenLastCalledWith({ trader: 'j ' });
  });
});

describe('TradeFilters wired to useTrades', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let queryClient: QueryClient;

  const requestedParams = () =>
    fetchMock.mock.calls.map(([url]) =>
      new URL(String(url), 'http://localhost').searchParams.toString(),
    );
  const lastParams = () => new URLSearchParams(requestedParams().at(-1));

  function Blotter() {
    const [filters, setFilters] = useState<TradeListQuery>({});
    useTrades(filters);
    return <TradeFilters filters={filters} onChange={setFilters} />;
  }

  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  async function renderBlotter() {
    render(<Blotter />, { wrapper });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    return userEvent.setup();
  }

  beforeEach(() => {
    fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: 30_000, retry: false } },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    queryClient.clear();
  });

  it('starts with an unfiltered request', async () => {
    await renderBlotter();

    expect(requestedParams()).toEqual(['']);
  });

  it.each([
    ['symbol', () => symbolInput(), 'A'],
    ['trader', () => traderInput(), 'j'],
  ] as const)('typing in %s re-fetches with that param', async (param, input, text) => {
    const user = await renderBlotter();

    await user.type(input(), text);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(lastParams().get(param)).toBe(text);
  });

  it.each([
    ['side', () => sideSelect(), 'SELL'],
    ['status', () => statusSelect(), 'CANCELLED'],
  ] as const)('selecting a %s re-fetches with that param', async (param, select, value) => {
    const user = await renderBlotter();

    await user.selectOptions(select(), value);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(lastParams().get(param)).toBe(value);
  });

  it('combines filters into one request', async () => {
    const user = await renderBlotter();

    await user.selectOptions(sideSelect(), 'BUY');
    await user.selectOptions(statusSelect(), 'ACTIVE');
    await user.type(symbolInput(), 'A');

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(Object.fromEntries(lastParams())).toEqual({
      side: 'BUY',
      status: 'ACTIVE',
      symbol: 'A',
    });
  });

  // Each test sets the control first, then another filter, so the key left after clearing has
  // never been fetched and must produce a fresh request.
  it.each([
    ['symbol', () => symbolInput()],
    ['trader', () => traderInput()],
  ] as const)('clearing %s re-fetches without the param', async (param, input) => {
    const user = await renderBlotter();
    await user.type(input(), 'Z');
    await user.selectOptions(sideSelect(), 'BUY');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    await user.clear(input());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(lastParams().has(param)).toBe(false);
    expect(Object.fromEntries(lastParams())).toEqual({ side: 'BUY' });
  });

  it.each([
    ['side', () => sideSelect(), 'SELL'],
    ['status', () => statusSelect(), 'CANCELLED'],
  ] as const)('choosing All for %s re-fetches without the param', async (param, select, value) => {
    const user = await renderBlotter();
    await user.selectOptions(select(), value);
    await user.type(symbolInput(), 'A');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    await user.selectOptions(select(), 'All');

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(lastParams().has(param)).toBe(false);
    expect(Object.fromEntries(lastParams())).toEqual({ symbol: 'A' });
  });

  it('never sends a whitespace-only text filter', async () => {
    const user = await renderBlotter();

    await user.type(symbolInput(), '   ');
    await user.selectOptions(sideSelect(), 'SELL');

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(Object.fromEntries(lastParams())).toEqual({ side: 'SELL' });
    expect(requestedParams().some((qs) => new URLSearchParams(qs).has('symbol'))).toBe(false);
  });

  it('sends a trimmed value and does not re-fetch for surrounding spaces', async () => {
    const user = await renderBlotter();

    await user.type(symbolInput(), ' AAPL ');

    await waitFor(() => expect(lastParams().get('symbol')).toBe('AAPL'));
    expect(symbolInput()).toHaveValue(' AAPL ');
    // '', 'A', 'AA', 'AAP', 'AAPL' — the leading and trailing spaces add no requests.
    expect(requestedParams()).toEqual(['', 'symbol=A', 'symbol=AA', 'symbol=AAP', 'symbol=AAPL']);
  });
});
