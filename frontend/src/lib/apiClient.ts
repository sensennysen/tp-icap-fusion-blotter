import type {
  AmendTradeInput,
  CreateTradeInput,
  Trade,
  TradeListQuery,
} from '@fusion-blotter/shared';

const BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  const body = await res.json();

  if (!res.ok) {
    throw new ApiError(res.status, body.error.code, body.error.message, body.error.fields);
  }

  return body.data as T;
}

function toQueryString(query: TradeListQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const apiClient = {
  listTrades: (query: TradeListQuery = {}) => request<Trade[]>(`/trades${toQueryString(query)}`),

  getTrade: (id: string) => request<Trade>(`/trades/${id}`),

  createTrade: (input: CreateTradeInput) =>
    request<Trade>('/trades', { method: 'POST', body: JSON.stringify(input) }),

  amendTrade: (id: string, input: AmendTradeInput) =>
    request<Trade>(`/trades/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),

  cancelTrade: (id: string) => request<Trade>(`/trades/${id}/cancel`, { method: 'POST' }),
};
