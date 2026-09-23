import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Trade, TradeEvent, TradeListQuery } from '@fusion-blotter/shared';
import { useRealtimeTrades } from '../src/hooks/useRealtimeTrades.js';
import { tradesQueryKey } from '../src/lib/queryClient.js';
import { ToastProvider, type ToastVariant } from '../src/components/Toast/ToastProvider.js';

// Spy on showToast while still delegating to the real provider, so toasts can
// be counted even after the provider's 5s auto-dismiss has removed them.
const toast = vi.hoisted(() => {
  const state: { real?: (variant: ToastVariant, message: string) => void } = {};
  const showToast = vi.fn((variant: ToastVariant, message: string) =>
    state.real?.(variant, message),
  );
  return { state, showToast };
});

vi.mock('../src/components/Toast/ToastProvider.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/components/Toast/ToastProvider.js')>();
  return {
    ...actual,
    useToast: () => {
      const ctx = actual.useToast();
      toast.state.real = ctx.showToast;
      return { ...ctx, showToast: toast.showToast };
    },
  };
});

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

  close() {
    this.emit('close', {});
  }

  emit(type: string, event: { data?: unknown }) {
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

const other: Trade = { ...trade, id: 'trade-2', tradeId: 'TRD-100002', symbol: 'MSFT' };

function latestSocket(): MockWebSocket {
  const socket = MockWebSocket.instances.at(-1);
  if (!socket) throw new Error('no socket opened');
  return socket;
}

function emitRaw(data: unknown) {
  act(() => latestSocket().emit('message', { data }));
}

function emitEvent(event: TradeEvent) {
  emitRaw(JSON.stringify(event));
}

/** Server accepts the connection. */
function openSocket() {
  act(() => latestSocket().emit('open', {}));
}

/** Server-side / network close — not initiated by the hook. */
function dropSocket() {
  act(() => latestSocket().emit('close', {}));
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function key(filters: TradeListQuery) {
  return [...tradesQueryKey, filters];
}

function toastCalls(variant: ToastVariant, message?: string) {
  return toast.showToast.mock.calls.filter(
    ([v, m]) => v === variant && (message === undefined || m === message),
  );
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
  vi.useFakeTimers();
  MockWebSocket.instances = [];
  vi.stubGlobal('WebSocket', MockWebSocket);
  toast.showToast.mockClear();
  // Mirrors lib/queryClient.ts staleTime so seeded data is fresh, as in the app.
  queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: false } },
  });
  queryClient.setQueryData(key({}), []);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  queryClient.clear();
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

  describe('cache reconciliation', () => {
    it('leaves a filtered cache unchanged when a created trade does not match', () => {
      queryClient.setQueryData(key({ symbol: 'MSFT' }), [other]);
      renderHook(() => useRealtimeTrades({ symbol: 'MSFT' }), { wrapper });

      emitEvent({ type: 'TRADE_CREATED', payload: trade });

      expect(queryClient.getQueryData(key({ symbol: 'MSFT' }))).toEqual([other]);
    });

    it('prepends a created trade ahead of existing rows', () => {
      queryClient.setQueryData(key({}), [other]);
      renderHook(() => useRealtimeTrades({}), { wrapper });

      emitEvent({ type: 'TRADE_CREATED', payload: trade });

      expect(queryClient.getQueryData(key({}))).toEqual([trade, other]);
    });

    it('prepends an amended trade that now matches but was not cached', () => {
      queryClient.setQueryData(key({ symbol: 'AAPL' }), [other]);
      renderHook(() => useRealtimeTrades({ symbol: 'AAPL' }), { wrapper });

      emitEvent({ type: 'TRADE_AMENDED', payload: trade });

      expect(queryClient.getQueryData(key({ symbol: 'AAPL' }))).toEqual([trade, other]);
    });

    it('removes an amended trade that no longer matches the filter', () => {
      queryClient.setQueryData(key({ trader: 'jdoe' }), [trade, other]);
      renderHook(() => useRealtimeTrades({ trader: 'jdoe' }), { wrapper });

      emitEvent({ type: 'TRADE_AMENDED', payload: { ...trade, trader: 'asmith' } });

      expect(queryClient.getQueryData(key({ trader: 'jdoe' }))).toEqual([other]);
    });

    it('ignores an amended trade that neither matches nor is cached', () => {
      queryClient.setQueryData(key({ side: 'SELL' }), [other]);
      renderHook(() => useRealtimeTrades({ side: 'SELL' }), { wrapper });

      emitEvent({ type: 'TRADE_AMENDED', payload: trade });

      expect(queryClient.getQueryData(key({ side: 'SELL' }))).toEqual([other]);
    });

    it('reconciles every cached filter variant against its own filters', () => {
      queryClient.setQueryData(key({}), [trade, other]);
      queryClient.setQueryData(key({ status: 'ACTIVE' }), [trade, other]);
      queryClient.setQueryData(key({ symbol: 'MSFT' }), [other]);
      renderHook(() => useRealtimeTrades({}), { wrapper });

      const cancelled: Trade = { ...trade, status: 'CANCELLED' };
      emitEvent({ type: 'TRADE_CANCELLED', payload: cancelled });

      expect(queryClient.getQueryData(key({}))).toEqual([cancelled, other]);
      expect(queryClient.getQueryData(key({ status: 'ACTIVE' }))).toEqual([other]);
      expect(queryClient.getQueryData(key({ symbol: 'MSFT' }))).toEqual([other]);
    });

    it('does not create data for a list whose first fetch has not resolved', () => {
      void queryClient.prefetchQuery({
        queryKey: key({ trader: 'jdoe' }),
        queryFn: () => new Promise<Trade[]>(() => {}),
      });
      renderHook(() => useRealtimeTrades({ trader: 'jdoe' }), { wrapper });

      emitEvent({ type: 'TRADE_CREATED', payload: trade });

      expect(queryClient.getQueryData(key({ trader: 'jdoe' }))).toBeUndefined();
      expect(queryClient.getQueryData(key({}))).toEqual([trade]);
    });

    it('never refetches the list the blotter is reading', () => {
      const queryFn = vi.fn(async () => [] as Trade[]);
      queryClient.setQueryData(key({}), [trade]);
      renderHook(
        () => {
          useQuery({ queryKey: key({}), queryFn });
          useRealtimeTrades({});
        },
        { wrapper },
      );

      emitEvent({ type: 'TRADE_CREATED', payload: other });
      emitEvent({ type: 'TRADE_AMENDED', payload: { ...trade, quantity: 5 } });
      emitEvent({ type: 'TRADE_CANCELLED', payload: { ...trade, status: 'CANCELLED' } });
      advance(1_000);

      expect(queryFn).not.toHaveBeenCalled();
      expect(queryClient.getQueryData(key({}))).toEqual([other, { ...trade, status: 'CANCELLED' }]);
    });
  });

  describe('connection', () => {
    it('connects to VITE_WS_URL', async () => {
      vi.stubEnv('VITE_WS_URL', 'ws://blotter.test:4000');
      vi.resetModules();
      const { useRealtimeTrades: freshHook } = await import('../src/hooks/useRealtimeTrades.js');

      renderHook(() => freshHook({}), { wrapper });

      expect(MockWebSocket.instances).toHaveLength(1);
      expect(latestSocket().url).toBe('ws://blotter.test:4000');
    });

    it('does not open a new socket when the filters change', () => {
      const { rerender } = renderHook(({ filters }) => useRealtimeTrades(filters), {
        wrapper,
        initialProps: { filters: {} as TradeListQuery },
      });
      openSocket();

      rerender({ filters: { symbol: 'AAPL' } });
      rerender({ filters: { status: 'CANCELLED' } });

      expect(MockWebSocket.instances).toHaveLength(1);
    });

    it('backs off exponentially from 1s and caps at 30s', () => {
      renderHook(() => useRealtimeTrades({}), { wrapper });

      for (const delay of [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000]) {
        const before = MockWebSocket.instances.length;
        dropSocket();
        advance(delay - 1);
        expect(MockWebSocket.instances).toHaveLength(before);
        advance(1);
        expect(MockWebSocket.instances).toHaveLength(before + 1);
      }
    });

    it('resets the backoff to 1s after a successful reconnect', () => {
      renderHook(() => useRealtimeTrades({}), { wrapper });
      for (const delay of [1_000, 2_000, 4_000]) {
        dropSocket();
        advance(delay);
      }
      openSocket();

      const before = MockWebSocket.instances.length;
      dropSocket();
      advance(1_000);

      expect(MockWebSocket.instances).toHaveLength(before + 1);
    });

    it('closes the socket and never reconnects after unmount', () => {
      const { unmount } = renderHook(() => useRealtimeTrades({}), { wrapper });
      openSocket();
      const closeSpy = vi.spyOn(latestSocket(), 'close');

      unmount();
      advance(60_000);

      expect(closeSpy).toHaveBeenCalledOnce();
      expect(MockWebSocket.instances).toHaveLength(1);
      expect(toastCalls('connection')).toHaveLength(0);
    });

    it('cancels a pending reconnect on unmount', () => {
      const { unmount } = renderHook(() => useRealtimeTrades({}), { wrapper });
      openSocket();
      dropSocket();

      unmount();
      advance(60_000);

      expect(MockWebSocket.instances).toHaveLength(1);
    });
  });

  describe('toasts', () => {
    it('shows connection lost once per outage and restored once on reconnect', () => {
      renderHook(() => useRealtimeTrades({}), { wrapper });
      openSocket();

      dropSocket();
      advance(1_000);
      dropSocket(); // retry refused
      advance(2_000);
      dropSocket(); // retry refused
      advance(4_000);

      expect(toastCalls('connection', 'Connection lost, reconnecting…')).toHaveLength(1);
      expect(toastCalls('connection', 'Connection restored')).toHaveLength(0);

      openSocket();

      expect(toastCalls('connection', 'Connection restored')).toHaveLength(1);
      expect(toastCalls('connection')).toHaveLength(2);
    });

    it('shows lost and restored again for a second outage', () => {
      renderHook(() => useRealtimeTrades({}), { wrapper });
      openSocket();
      for (let outage = 0; outage < 2; outage += 1) {
        dropSocket();
        advance(1_000);
        openSocket();
      }

      expect(toastCalls('connection', 'Connection lost, reconnecting…')).toHaveLength(2);
      expect(toastCalls('connection', 'Connection restored')).toHaveLength(2);
    });

    it('does not show restored on the first successful connect', () => {
      renderHook(() => useRealtimeTrades({}), { wrapper });
      openSocket();

      expect(toastCalls('connection')).toHaveLength(0);
    });

    it('stays quiet when the very first connect fails, since nothing was lost', () => {
      renderHook(() => useRealtimeTrades({}), { wrapper });
      dropSocket();
      advance(1_000);
      openSocket();

      expect(MockWebSocket.instances).toHaveLength(2);
      expect(toastCalls('connection')).toHaveLength(0);
    });

    it('renders the lost and restored messages through the ToastProvider', () => {
      renderHook(() => useRealtimeTrades({}), { wrapper });
      openSocket();

      dropSocket();
      expect(screen.getByText('Connection lost, reconnecting…')).toBeInTheDocument();

      advance(1_000);
      openSocket();
      expect(screen.getByText('Connection restored')).toBeInTheDocument();
    });

    it.each([
      ['TRADE_CREATED', 'created: TRD-100001'],
      ['TRADE_AMENDED', 'amended: TRD-100001'],
      ['TRADE_CANCELLED', 'cancelled: TRD-100001'],
    ] as const)('shows an info toast for %s', (type, message) => {
      renderHook(() => useRealtimeTrades({}), { wrapper });

      emitEvent({ type, payload: trade });

      expect(toastCalls('info', message)).toHaveLength(1);
      expect(screen.getByText(message)).toBeInTheDocument();
    });
  });

  describe('malformed frames', () => {
    // JSON.stringify drops undefined fields, so these serialize without the key.
    const withoutId = { ...trade, id: undefined };
    const withoutTradeId = { ...trade, tradeId: undefined };

    it.each([
      ['non-JSON text', 'not json'],
      ['a non-string frame', new ArrayBuffer(8)],
      ['JSON null', 'null'],
      ['a JSON number', '42'],
      ['a non-string type', JSON.stringify({ type: 1, payload: trade })],
      ['an unknown type', JSON.stringify({ type: 'TRADE_EXPLODED', payload: trade })],
      ['a missing payload', JSON.stringify({ type: 'TRADE_CREATED' })],
      ['a null payload', JSON.stringify({ type: 'TRADE_CREATED', payload: null })],
      ['a string payload', JSON.stringify({ type: 'TRADE_CREATED', payload: 'trade' })],
      ['a payload without id', JSON.stringify({ type: 'TRADE_CREATED', payload: withoutId })],
      [
        'a payload without tradeId',
        JSON.stringify({ type: 'TRADE_CREATED', payload: withoutTradeId }),
      ],
    ])('ignores %s and keeps applying later events', (_label, data) => {
      renderHook(() => useRealtimeTrades({}), { wrapper });

      expect(() => emitRaw(data)).not.toThrow();
      expect(queryClient.getQueryData(key({}))).toEqual([]);
      expect(toast.showToast).not.toHaveBeenCalled();

      emitEvent({ type: 'TRADE_CREATED', payload: trade });
      expect(queryClient.getQueryData(key({}))).toEqual([trade]);
    });
  });
});
