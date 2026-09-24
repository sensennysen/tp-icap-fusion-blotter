import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { AuthUser, Trade } from '@fusion-blotter/shared';
import { App } from '../src/App.js';
import { ToastProvider } from '../src/components/Toast/ToastProvider.js';
import { createQueryClient } from '../src/lib/queryClient.js';
import { json } from './tradeForm.js';

// Scope: the session gate. The fake API keeps a server-side session that
// login/logout set and clear, like the real cookie.

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

const unauthorized = () => json(401, { error: { code: 'UNAUTHORIZED', message: 'Not logged in' } });

let session: AuthUser | null;
let meResponse: (() => Response) | undefined;
let loginResponse: ((body: AuthUser) => Response) | undefined;
let queryClient: QueryClient;

function api(url: string, init?: RequestInit): Response {
  // Strip whatever base URL prefix is configured (none in tests).
  const path = new URL(url, 'http://localhost').pathname.replace(/^.*?(?=\/(auth|trades)\b)/, '');
  const method = init?.method ?? 'GET';
  if (path === '/auth/me')
    return meResponse?.() ?? (session ? json(200, { data: session }) : unauthorized());
  if (path === '/auth/login') {
    const body = JSON.parse(init!.body as string) as AuthUser;
    if (loginResponse) return loginResponse(body);
    session = body;
    return json(200, { data: body });
  }
  if (path === '/auth/logout') {
    session = null;
    return new Response(null, { status: 204 });
  }
  if (method === 'GET') return json(200, { data: [trade] });
  return session ? json(200, { data: { ...trade, status: 'CANCELLED' } }) : unauthorized();
}

function renderApp() {
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return user;
}

const signInButton = () => screen.findByRole('button', { name: 'Sign in' });

beforeEach(() => {
  session = null;
  meResponse = undefined;
  loginResponse = undefined;
  vi.stubGlobal('WebSocket', MockWebSocket);
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (url, init) => api(String(url), init)),
  );
  // The app's own client (for its 401 handling), minus retry delays.
  queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { staleTime: 30_000, retry: false } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  queryClient.clear();
});

describe('App session gate', () => {
  it('shows the login form when there is no session', async () => {
    renderApp();

    expect(await signInButton()).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Trade blotter' })).not.toBeInTheDocument();
  });

  it('shows the blotter after a successful sign-in', async () => {
    const user = renderApp();

    const signIn = await signInButton();
    await user.type(screen.getByLabelText(/^Username/), 'asmith');
    await user.click(signIn);

    expect(await screen.findByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.getByText(/Signed in as/)).toHaveTextContent('Signed in as asmith (trader)');
    expect(await screen.findByText('TRD-100001')).toBeInTheDocument();
  });

  it('toasts a failed sign-in and stays on the form', async () => {
    loginResponse = () => json(500, { error: { code: 'INTERNAL_ERROR', message: 'boom' } });
    const user = renderApp();

    const signIn = await signInButton();
    await user.type(screen.getByLabelText(/^Username/), 'asmith');
    await user.click(signIn);

    expect(await screen.findByText('Failed to sign in')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Username/)).toHaveValue('asmith');
  });

  it('goes straight to the blotter for an existing session, and back to login on sign-out', async () => {
    session = { username: 'asmith', role: 'trader' };
    const user = renderApp();

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(await signInButton()).toBeInTheDocument();
    expect(session).toBeNull();
  });

  it('drops back to login when a mutation finds the session gone (401)', async () => {
    session = { username: 'asmith', role: 'trader' };
    const user = renderApp();
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    session = null; // e.g. cleared in another tab

    await user.click(screen.getByRole('button', { name: 'Cancel Trade' }));

    expect(await signInButton()).toBeInTheDocument();
  });

  it('offers a retry when the session check itself fails', async () => {
    meResponse = () => json(500, { error: { code: 'INTERNAL_ERROR', message: 'boom' } });
    const user = renderApp();

    expect(await screen.findByText(/Couldn.t reach the server/)).toBeInTheDocument();
    meResponse = undefined;
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(await signInButton()).toBeInTheDocument();
  });
});
