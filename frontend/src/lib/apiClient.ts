import type {
  AmendTradeInput,
  AuthUser,
  CreateTradeInput,
  LoginInput,
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
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ApiError';
  }
}

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const error = (value as { error?: unknown }).error;
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      // The API is a different origin; the mock-auth session cookie only
      // travels (and is only stored from Set-Cookie) with credentials included.
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch (cause) {
    throw new ApiError(0, 'NETWORK_ERROR', 'Network request failed', undefined, { cause });
  }

  const body = await parseBody(res);

  if (!res.ok) {
    if (isErrorEnvelope(body)) {
      const { code, message, fields } = body.error;
      throw new ApiError(res.status, code, message, fields);
    }
    throw new ApiError(res.status, 'HTTP_ERROR', res.statusText || 'Request failed');
  }

  // A 204 (e.g. logout) has no body to unwrap.
  if (res.status === 204) return undefined as T;
  return (body as { data: T }).data;
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

  getTrade: (id: string) => request<Trade>(`/trades/${encodeURIComponent(id)}`),

  createTrade: (input: CreateTradeInput) =>
    request<Trade>('/trades', { method: 'POST', body: JSON.stringify(input) }),

  amendTrade: (id: string, input: AmendTradeInput) =>
    request<Trade>(`/trades/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  cancelTrade: (id: string) =>
    request<Trade>(`/trades/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),

  login: (input: LoginInput) =>
    request<AuthUser>('/auth/login', { method: 'POST', body: JSON.stringify(input) }),

  logout: () => request<undefined>('/auth/logout', { method: 'POST' }),

  // Rejects with a 401 ApiError when there is no session.
  me: () => request<AuthUser>('/auth/me'),
};
