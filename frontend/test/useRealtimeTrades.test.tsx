import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Trade, TradeEvent } from '@fusion-blotter/shared';
import { useRealtimeTrades } from '../src/hooks/useRealtimeTrades.js';
import { tradesQueryKey } from '../src/lib/queryClient.js';
import { ToastProvider } from '../src/components/Toast/ToastProvider.js';

type Listener = (event: { data?: string }) => void;

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  listeners: Record<string, Listener[]> = {};

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    (this.listeners[type] ??= []).push(listener);
  }

  close() {
    this.emit('close', {});
  }

  emit(type: string, event: { data?: string }) {
    for (const listener of this.listeners[type] ?? []) listener(event);
  }
}

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
  tradeTimestamp: new Date().toISOString(),
  status: 'ACTIVE',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function emitEvent(event: TradeEvent) {
  const socket = MockWebSocket.instances.at(-1);
  socket?.emit('message', { data: JSON.stringify(event) });
}

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal('WebSocket', MockWebSocket);
  queryClient = new QueryClient();
  queryClient.setQueryData([...tradesQueryKey, {}], []);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useRealtimeTrades', () => {
  it('adds a trade to the cache on TRADE_CREATED', () => {
    renderHook(() => useRealtimeTrades({}), { wrapper });

    emitEvent({ type: 'TRADE_CREATED', payload: trade });

    expect(queryClient.getQueryData([...tradesQueryKey, {}])).toEqual([trade]);
  });

  it('updates the matching trade in the cache on TRADE_AMENDED', () => {
    queryClient.setQueryData([...tradesQueryKey, {}], [trade]);
    renderHook(() => useRealtimeTrades({}), { wrapper });

    const amended: Trade = { ...trade, quantity: 250 };
    emitEvent({ type: 'TRADE_AMENDED', payload: amended });

    expect(queryClient.getQueryData([...tradesQueryKey, {}])).toEqual([amended]);
  });

  it('marks the matching trade cancelled in the cache on TRADE_CANCELLED', () => {
    queryClient.setQueryData([...tradesQueryKey, {}], [trade]);
    renderHook(() => useRealtimeTrades({}), { wrapper });

    const cancelled: Trade = { ...trade, status: 'CANCELLED' };
    emitEvent({ type: 'TRADE_CANCELLED', payload: cancelled });

    expect(queryClient.getQueryData([...tradesQueryKey, {}])).toEqual([cancelled]);
  });

  it('removes a trade from a status-filtered cache once cancelled', () => {
    queryClient.setQueryData([...tradesQueryKey, { status: 'ACTIVE' }], [trade]);
    renderHook(() => useRealtimeTrades({ status: 'ACTIVE' }), { wrapper });

    const cancelled: Trade = { ...trade, status: 'CANCELLED' };
    emitEvent({ type: 'TRADE_CANCELLED', payload: cancelled });

    expect(queryClient.getQueryData([...tradesQueryKey, { status: 'ACTIVE' }])).toEqual([]);
  });
});
