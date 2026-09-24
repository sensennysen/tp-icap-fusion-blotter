import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Trade } from '@fusion-blotter/shared';
import { TradeBlotterPage } from '../src/pages/TradeBlotterPage.js';
import { ToastProvider } from '../src/components/Toast/ToastProvider.js';
import { field, fill, json, validText } from './tradeForm.js';

// Scope: the page's mutation wiring only — toast, then keep a create/amend modal
// open on failure (retro #94) or close it on success; the cancel confirm closes
// either way (TASK-017 AC). Grid, filters and realtime behaviour are covered by
// their own suites.

class MockWebSocket {
  addEventListener() {}
  close() {}
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

function renderPage() {
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <TradeBlotterPage />
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
  vi.stubGlobal('WebSocket', MockWebSocket);
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (_url, init) =>
      (init?.method ?? 'GET') === 'GET' ? json(200, { data: [trade] }) : mutationResponse(),
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
