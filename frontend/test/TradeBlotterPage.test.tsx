import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AuthUser, Trade, TradeEvent } from '@fusion-blotter/shared';
import { TradeBlotterPage } from '../src/pages/TradeBlotterPage.js';
import { ToastProvider } from '../src/components/Toast/ToastProvider.js';
import { field, fill, json, validText } from './tradeForm.js';

// Scope: the page's own wiring. Mutations toast, then keep a create/amend modal
// open on failure (retro #94) or close it on success; the cancel confirm closes
// either way (TASK-017 AC). The toolbar, Refresh, filters and WebSocket events
// reach the grid (TASK-018 AC). How the grid, filters and realtime hook behave
// on their own is covered by their own suites.

type Listener = (event: { data?: unknown }) => void;

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  listeners: Record<string, Listener[]> = {};

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    (this.listeners[type] ??= []).push(listener);
  }

  close() {}

  emit(type: string, event: { data?: unknown }) {
    for (const listener of this.listeners[type] ?? []) listener(event);
  }
}

const trade: Trade = {
  id: 'trade-1',
  tradeId: 'TRD-100001',
  symbol: 'MSFT',
  side: 'SELL',
  quantity: 2500,
  price: 410.5,
  trader: 'asmith',
  book: 'EQ-NY-02',
  counterparty: 'JPM',
  tradeTimestamp: '2026-09-20T14:30:00.000Z',
  status: 'ACTIVE',
  createdAt: '2026-09-20T14:30:00.000Z',
  updatedAt: '2026-09-20T14:30:00.000Z',
};

const failure = json(500, { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });

let queryClient: QueryClient;
let mutationResponse: () => Response;
let listResponse: (url: URL) => Response;

const trader: AuthUser = { username: 'asmith', role: 'trader' };

function renderPage(sessionUser: AuthUser = trader, onLogout = vi.fn()) {
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <TradeBlotterPage user={sessionUser} onLogout={onLogout} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return user;
}

async function openCreate(user: UserEvent) {
  await user.click(screen.getByRole('button', { name: 'New Trade' }));
  await fill(user, validText);
  await user.click(screen.getByRole('button', { name: 'Create Trade' }));
}

async function openAmend(user: UserEvent) {
  await user.click(await screen.findByRole('button', { name: 'Amend' }));
  await fill(user, { Price: '411.25' });
  await user.click(screen.getByRole('button', { name: 'Save Changes' }));
}

beforeEach(() => {
  MockWebSocket.instances = [];
  listResponse = () => json(200, { data: [trade] });
  vi.stubGlobal('WebSocket', MockWebSocket);
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (url, init) =>
      (init?.method ?? 'GET') === 'GET'
        ? listResponse(new URL(String(url), 'http://localhost'))
        : mutationResponse(),
    ),
  );
  queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: false } },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  queryClient.clear();
});

describe('TradeBlotterPage create/amend wiring', () => {
  it('toasts a failed create and keeps the modal open with the input', async () => {
    mutationResponse = () => failure.clone();
    const user = renderPage();

    await openCreate(user);

    expect(await screen.findByText('Failed to create trade')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'New Trade' })).toBeInTheDocument();
    expect(field('Symbol')).toHaveValue('AAPL');
    expect(screen.queryByText('Trade created')).not.toBeInTheDocument();
  });

  it('toasts a successful create and closes the modal', async () => {
    mutationResponse = () => json(201, { data: { ...trade, id: 'trade-2', symbol: 'AAPL' } });
    const user = renderPage();

    await openCreate(user);

    expect(await screen.findByText('Trade created')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('toasts a failed amend and keeps the modal open with the edit', async () => {
    mutationResponse = () => failure.clone();
    const user = renderPage();

    await openAmend(user);

    expect(await screen.findByText('Failed to amend trade')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Amend TRD-100001' })).toBeInTheDocument();
    expect(field('Price')).toHaveValue(411.25);
  });

  it('toasts a successful amend and closes the modal', async () => {
    mutationResponse = () => json(200, { data: { ...trade, price: 411.25 } });
    const user = renderPage();

    await openAmend(user);

    expect(await screen.findByText('Trade amended')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('TradeBlotterPage cancel wiring', () => {
  const mutationCalls = () =>
    vi
      .mocked(fetch)
      .mock.calls.filter(([, init]) => (init?.method ?? 'GET') !== 'GET')
      .map(([url, init]) => `${init?.method} ${String(url)}`);

  async function openCancel(user: UserEvent) {
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    return screen.getByRole('alertdialog', { name: 'Cancel TRD-100001?' });
  }

  it('cancels the trade, toasts success and closes the dialog', async () => {
    mutationResponse = () => json(200, { data: { ...trade, status: 'CANCELLED' } });
    const user = renderPage();

    await openCancel(user);
    await user.click(screen.getByRole('button', { name: 'Cancel Trade' }));

    expect(await screen.findByText('Trade cancelled')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(mutationCalls()).toHaveLength(1);
    expect(mutationCalls()[0]).toMatch(/^POST .*\/trades\/trade-1\/cancel$/);
  });

  it.each([
    ['a server error', () => failure.clone()],
    [
      'an already-cancelled conflict',
      () =>
        json(409, { error: { code: 'CONFLICT', message: 'Trade trade-1 is already cancelled' } }),
    ],
  ])('toasts %s and still closes the dialog', async (_label, response) => {
    mutationResponse = response;
    const user = renderPage();

    await openCancel(user);
    await user.click(screen.getByRole('button', { name: 'Cancel Trade' }));

    expect(await screen.findByText('Failed to cancel trade')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.queryByText('Trade cancelled')).not.toBeInTheDocument();
  });

  it('closes on Keep Trade without sending a request', async () => {
    const user = renderPage();

    await openCancel(user);
    await user.click(screen.getByRole('button', { name: 'Keep Trade' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mutationCalls()).toEqual([]);
  });
});

describe('TradeBlotterPage toolbar and live data', () => {
  const buyTrade: Trade = {
    ...trade,
    id: 'trade-2',
    tradeId: 'TRD-100002',
    symbol: 'AAPL',
    side: 'BUY',
  };

  const listCalls = () =>
    vi
      .mocked(fetch)
      .mock.calls.filter(([, init]) => (init?.method ?? 'GET') === 'GET')
      .map(([url]) => new URL(String(url), 'http://localhost'));

  const rowOf = (tradeId: string) => screen.getByText(tradeId).closest('tr')!;

  function emit(event: TradeEvent) {
    const socket = MockWebSocket.instances.at(-1);
    if (!socket) throw new Error('no socket opened');
    act(() => socket.emit('message', { data: JSON.stringify(event) }));
  }

  it('puts the filters, Refresh and New Trade in a toolbar above the grid', async () => {
    renderPage();

    const filters = screen.getByRole('group', { name: 'Filter trades' });
    for (const label of ['Symbol', 'Trader', 'Side', 'Status']) {
      expect(within(filters).getByLabelText(label)).toBeInTheDocument();
    }
    const refresh = screen.getByRole('button', { name: 'Refresh trades' });
    const newTrade = screen.getByRole('button', { name: 'New Trade' });
    const grid = await screen.findByRole('table', { name: 'Trade blotter' });

    for (const control of [filters, refresh, newTrade]) {
      expect(control.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('refetches on Refresh, even while the list is fresh, and shows the new rows', async () => {
    const user = renderPage();
    await screen.findByText('TRD-100001');
    listResponse = () => json(200, { data: [trade, buyTrade] });

    await user.click(screen.getByRole('button', { name: 'Refresh trades' }));

    expect(await screen.findByText('TRD-100002')).toBeInTheDocument();
    expect(listCalls()).toHaveLength(2);
    expect(screen.queryByText('Failed to refresh trades')).not.toBeInTheDocument();
  });

  it('toasts a failed Refresh and keeps the rows already shown', async () => {
    const user = renderPage();
    await screen.findByText('TRD-100001');
    listResponse = () => failure.clone();

    await user.click(screen.getByRole('button', { name: 'Refresh trades' }));

    expect(await screen.findByText('Failed to refresh trades')).toBeInTheDocument();
    expect(screen.getByText('TRD-100001')).toBeInTheDocument();
    expect(
      screen.queryByText("Couldn't load trades. Use Refresh to retry."),
    ).not.toBeInTheDocument();
  });

  it('shows a load error instead of an empty result, and Refresh recovers', async () => {
    listResponse = () => failure.clone();
    const user = renderPage();

    expect(await screen.findByText("Couldn't load trades. Use Refresh to retry.")).toHaveAttribute(
      'role',
      'alert',
    );
    expect(screen.queryByText('No trades match the current filters.')).not.toBeInTheDocument();

    listResponse = () => json(200, { data: [trade] });
    await user.click(screen.getByRole('button', { name: 'Refresh trades' }));

    expect(await screen.findByText('TRD-100001')).toBeInTheDocument();
    expect(
      screen.queryByText("Couldn't load trades. Use Refresh to retry."),
    ).not.toBeInTheDocument();
  });

  it('re-queries with the chosen filter and shows what comes back', async () => {
    listResponse = (url) => {
      const side = url.searchParams.get('side');
      return json(200, { data: [trade, buyTrade].filter((t) => !side || t.side === side) });
    };
    const user = renderPage();
    await screen.findByText('TRD-100002');

    await user.selectOptions(screen.getByLabelText('Side'), 'SELL');

    await waitFor(() => expect(screen.queryByText('TRD-100002')).not.toBeInTheDocument());
    expect(screen.getByText('TRD-100001')).toBeInTheDocument();
    expect(listCalls().at(-1)?.searchParams.get('side')).toBe('SELL');
  });

  it.each([
    ['TRADE_CREATED', buyTrade, 'created: TRD-100002'],
    ['TRADE_AMENDED', { ...trade, symbol: 'NVDA' }, 'amended: TRD-100001'],
  ] as const)(
    'shows a %s event in the grid with a toast and no refetch',
    async (type, payload, toast) => {
      renderPage();
      await screen.findByText('TRD-100001');

      emit({ type, payload });

      expect(await screen.findByText(toast)).toBeInTheDocument();
      expect(within(rowOf(payload.tradeId)).getByText(payload.symbol)).toBeInTheDocument();
      expect(listCalls()).toHaveLength(1);
    },
  );

  it('dims a row cancelled over the WebSocket and removes its actions', async () => {
    renderPage();
    await screen.findByText('TRD-100001');

    emit({ type: 'TRADE_CANCELLED', payload: { ...trade, status: 'CANCELLED' } });

    expect(await screen.findByText('cancelled: TRD-100001')).toBeInTheDocument();
    expect(rowOf('TRD-100001')).toHaveClass('opacity-50');
    expect(within(rowOf('TRD-100001')).queryByRole('button')).not.toBeInTheDocument();
    expect(listCalls()).toHaveLength(1);
  });
});

describe('TradeBlotterPage session', () => {
  it('shows who is signed in and signs out through onLogout', async () => {
    const onLogout = vi.fn();
    const user = renderPage(trader, onLogout);

    expect(screen.getByText(/Signed in as/)).toHaveTextContent('Signed in as asmith (trader)');
    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('gives a trader the New Trade and row actions', async () => {
    renderPage();

    expect(await screen.findByRole('button', { name: 'Amend' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New Trade' })).toBeInTheDocument();
  });

  it('gives a viewer a read-only blotter: rows, but no New Trade or row actions', async () => {
    renderPage({ username: 'vwong', role: 'viewer' });

    expect(await screen.findByText('TRD-100001')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New Trade' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Amend' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument();
  });
});
