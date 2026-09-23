import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Trade, TradeEvent, TradeListQuery } from '@fusion-blotter/shared';
import { tradesQueryKey } from '../lib/queryClient.js';
import { useToast } from '../components/Toast/ToastProvider.js';

const WS_URL = import.meta.env.VITE_WS_URL as string;
const MAX_BACKOFF_MS = 30_000;
const INITIAL_BACKOFF_MS = 1_000;
const EVENT_TYPES: ReadonlySet<string> = new Set([
  'TRADE_CREATED',
  'TRADE_AMENDED',
  'TRADE_CANCELLED',
]);

function isTradeEvent(value: unknown): value is TradeEvent {
  if (typeof value !== 'object' || value === null) return false;
  const { type, payload } = value as { type?: unknown; payload?: unknown };
  if (typeof type !== 'string' || !EVENT_TYPES.has(type)) return false;
  if (typeof payload !== 'object' || payload === null) return false;
  const { id, tradeId } = payload as { id?: unknown; tradeId?: unknown };
  return typeof id === 'string' && typeof tradeId === 'string';
}

function parseEvent(data: unknown): TradeEvent | null {
  if (typeof data !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  return isTradeEvent(parsed) ? parsed : null;
}

function matchesFilter(trade: Trade, filters: TradeListQuery): boolean {
  if (filters.symbol && trade.symbol !== filters.symbol) return false;
  if (filters.trader && trade.trader !== filters.trader) return false;
  if (filters.side && trade.side !== filters.side) return false;
  if (filters.status && trade.status !== filters.status) return false;
  return true;
}

function reconcile(trades: Trade[], event: TradeEvent, filters: TradeListQuery): Trade[] {
  const { payload } = event;

  switch (event.type) {
    case 'TRADE_CREATED':
      return matchesFilter(payload, filters) ? [payload, ...trades] : trades;

    case 'TRADE_AMENDED':
    case 'TRADE_CANCELLED': {
      const exists = trades.some((t) => t.id === payload.id);
      if (!matchesFilter(payload, filters)) {
        return exists ? trades.filter((t) => t.id !== payload.id) : trades;
      }
      return exists ? trades.map((t) => (t.id === payload.id ? payload : t)) : [payload, ...trades];
    }

    default:
      return trades;
  }
}

/**
 * Connects to the real-time trade WebSocket and reconciles every event
 * directly into the TanStack Query cache (ADR-004) — no forced refetch.
 *
 * Every cached `[...tradesQueryKey, filters]` variant is reconciled against
 * its own filters, so the list the blotter is reading (and any filter set it
 * returns to within `staleTime`) is current. Variants whose first fetch has
 * not resolved are left alone; that fetch is the source of truth.
 *
 * `_filters` is kept for call-site stability: the active key is one of the
 * cached variants, so it no longer needs to be passed in.
 */
export function useRealtimeTrades(_filters: TradeListQuery): void {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  useEffect(() => {
    let socket: WebSocket | null = null;
    let backoff = INITIAL_BACKOFF_MS;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let closedByEffect = false;
    let isConnected = false;
    let hasLostConnection = false;

    function applyEvent(event: TradeEvent) {
      const cached = queryClient.getQueriesData<Trade[]>({ queryKey: tradesQueryKey });
      for (const [key, trades] of cached) {
        if (trades === undefined) continue;
        const filters = (key[1] ?? {}) as TradeListQuery;
        queryClient.setQueryData<Trade[]>(key, reconcile(trades, event, filters));
      }
    }

    function connect() {
      socket = new WebSocket(WS_URL);

      socket.addEventListener('open', () => {
        backoff = INITIAL_BACKOFF_MS;
        isConnected = true;
        if (hasLostConnection) {
          showToast('connection', 'Connection restored');
        }
      });

      socket.addEventListener('message', (messageEvent) => {
        const event = parseEvent(messageEvent.data);
        if (!event) return;
        applyEvent(event);
        showToast(
          'info',
          `${event.type.replace('TRADE_', '').toLowerCase()}: ${event.payload.tradeId}`,
        );
      });

      socket.addEventListener('close', () => {
        if (closedByEffect) return;
        if (isConnected) {
          showToast('connection', 'Connection lost, reconnecting…');
          hasLostConnection = true;
        }
        isConnected = false;
        reconnectTimer = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      });
    }

    connect();

    return () => {
      closedByEffect = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [queryClient, showToast]);
}
