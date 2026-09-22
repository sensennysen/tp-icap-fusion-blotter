import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Trade, TradeEvent, TradeListQuery } from '@fusion-blotter/shared';
import { tradesQueryKey } from '../lib/queryClient.js';
import { useToast } from '../components/Toast/ToastProvider.js';

const WS_URL = import.meta.env.VITE_WS_URL as string;
const MAX_BACKOFF_MS = 30_000;
const INITIAL_BACKOFF_MS = 1_000;

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
 * directly into the exact TanStack Query cache key the blotter list is
 * currently reading (ADR-004) — no forced refetch.
 */
export function useRealtimeTrades(filters: TradeListQuery): void {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  useEffect(() => {
    let socket: WebSocket | null = null;
    let backoff = INITIAL_BACKOFF_MS;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let closedByEffect = false;
    let hasConnectedBefore = false;

    function connect() {
      socket = new WebSocket(WS_URL);

      socket.addEventListener('open', () => {
        backoff = INITIAL_BACKOFF_MS;
        if (hasConnectedBefore) {
          showToast('connection', 'Connection restored');
        }
        hasConnectedBefore = true;
      });

      socket.addEventListener('message', (messageEvent) => {
        const event = JSON.parse(messageEvent.data as string) as TradeEvent;
        const key = [...tradesQueryKey, filtersRef.current];
        queryClient.setQueryData<Trade[]>(key, (current) =>
          reconcile(current ?? [], event, filtersRef.current),
        );
        showToast(
          'info',
          `${event.type.replace('TRADE_', '').toLowerCase()}: ${event.payload.tradeId}`,
        );
      });

      socket.addEventListener('close', () => {
        if (closedByEffect) return;
        showToast('connection', 'Connection lost, reconnecting…');
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
