import type { TradeListQuery } from '@fusion-blotter/shared';

/**
 * Canonical form of a filter set, used for both the query key and the request. Text filters
 * are trimmed the way `tradeListQuerySchema` trims them server-side, and blank or undefined
 * fields are dropped, so "AAPL " and "AAPL" share one cache entry and `useRealtimeTrades`
 * matches events against the same value the server filtered by. A whitespace-only filter is
 * omitted rather than sent (the server would reject it after trimming).
 */
export function normalizeTradeListQuery(query: TradeListQuery): TradeListQuery {
  const symbol = query.symbol?.trim();
  const trader = query.trader?.trim();

  return {
    ...(symbol ? { symbol } : {}),
    ...(trader ? { trader } : {}),
    ...(query.side ? { side: query.side } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.sort ? { sort: query.sort } : {}),
    ...(query.order ? { order: query.order } : {}),
  };
}
