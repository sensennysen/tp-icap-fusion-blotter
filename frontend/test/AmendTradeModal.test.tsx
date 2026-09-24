import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { AmendTradeInput, Trade } from '@fusion-blotter/shared';
import { AmendTradeModal } from '../src/components/AmendTradeModal.js';
import { CreateTradeModal } from '../src/components/CreateTradeModal.js';
import { ApiError } from '../src/lib/apiClient.js';
import { useTrades } from '../src/hooks/useTrades.js';
import { errorFor, field, fill, json } from './tradeForm.js';

// Deliberately different from the create defaults: SELL and a 4dp price.
const trade: Trade = {
  id: 'trade-1',
  tradeId: 'TRD-100001',
  symbol: 'MSFT',
  side: 'SELL',
  quantity: 2500,
  price: 10.1249,
  trader: 'asmith',
  book: 'EQ-NY-02',
  counterparty: 'JPM',
  tradeTimestamp: '2026-09-20T14:30:00.000Z',
  status: 'ACTIVE',
  createdAt: '2026-09-20T14:30:00.000Z',
  updatedAt: '2026-09-20T14:30:00.000Z',
};

const editable: AmendTradeInput = {
  symbol: trade.symbol,
  side: trade.side,
  quantity: trade.quantity,
  price: trade.price,
  trader: trade.trader,
  book: trade.book,
  counterparty: trade.counterparty,
};

const saveButton = () => screen.getByRole('button', { name: 'Save Changes' });

function renderModal(onSubmit = vi.fn<(input: AmendTradeInput) => Promise<void>>()) {
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(<AmendTradeModal trade={trade} onClose={onClose} onSubmit={onSubmit} />);
  return { user, onClose, onSubmit };
}

describe('AmendTradeModal', () => {
  it('titles the dialog with the tradeId and pre-fills every editable field', () => {
    renderModal();

    expect(screen.getByRole('dialog', { name: 'Amend TRD-100001' })).toHaveFocus();
    expect(field('Symbol')).toHaveValue('MSFT');
    expect(field('Side')).toHaveValue('SELL');
    expect(field('Quantity')).toHaveValue(2500);
    expect(field('Price')).toHaveValue(10.1249);
    expect(field('Trader')).toHaveValue('asmith');
    expect(field('Book')).toHaveValue('EQ-NY-02');
    expect(field('Counterparty')).toHaveValue('JPM');
  });

  it('submits the untouched pre-filled values as-is (the 4dp price round-trips)', async () => {
    const { user, onSubmit, onClose } = renderModal(vi.fn().mockResolvedValue(undefined));

    await user.click(saveButton());

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(editable);
  });

  it('submits the edited values over the pre-fill and then closes', async () => {
    const { user, onSubmit, onClose } = renderModal(vi.fn().mockResolvedValue(undefined));

    await fill(user, { Price: '190.25', Side: 'BUY', Book: ' EQ-LON-01 ' });
    await user.click(saveButton());

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      ...editable,
      price: 190.25,
      side: 'BUY',
      book: 'EQ-LON-01',
    });
  });

  it.each([
    ['Symbol', '', 'symbol is required'],
    ['Counterparty', '  ', 'counterparty is required'],
    ['Quantity', '', 'quantity is required'],
    ['Quantity', '2147483648', 'quantity is too large'],
    ['Price', '', 'price is required'],
    ['Price', '10.12491', 'price allows at most 4 decimal places'],
  ])('applies the same shared rule as create: %s = "%s" → "%s"', async (label, value, message) => {
    const { user, onSubmit } = renderModal();

    await fill(user, { [label]: value });
    await user.click(saveButton());

    await waitFor(() => expect(errorFor(label)).toBe(message));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('stays open with the edits intact when onSubmit rejects', async () => {
    const { user, onSubmit, onClose } = renderModal(
      vi.fn().mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Trade not found')),
    );

    await fill(user, { Price: '190.25' });
    await user.click(saveButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(saveButton()).toBeEnabled());
    expect(onClose).not.toHaveBeenCalled();
    expect(field('Price')).toHaveValue(190.25);
  });

  it('shows server field errors under the matching inputs', async () => {
    const { user } = renderModal(
      vi.fn().mockRejectedValue(
        new ApiError(400, 'VALIDATION_ERROR', 'Invalid request payload', {
          book: 'book is closed',
        }),
      ),
    );

    await user.click(saveButton());

    await waitFor(() => expect(errorFor('Book')).toBe('book is closed'));
    expect(errorFor('Symbol')).toBeUndefined();
  });

  it('gives each open dialog its own title id', () => {
    render(
      <>
        <CreateTradeModal onClose={vi.fn()} onSubmit={vi.fn()} />
        <AmendTradeModal trade={trade} onClose={vi.fn()} onSubmit={vi.fn()} />
      </>,
    );

    expect(screen.getByRole('dialog', { name: 'New Trade' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Amend TRD-100001' })).toBeInTheDocument();
  });
});

describe('AmendTradeModal wired to useTrades().amendTrade', () => {
  let queryClient: QueryClient;
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  let patchResponse: () => Response;

  const calls = (method: string) =>
    fetchMock.mock.calls.filter(([, init]) => (init?.method ?? 'GET') === method);

  function Harness({ onClose }: { onClose: () => void }) {
    const { amendTrade } = useTrades({});
    return (
      <AmendTradeModal
        trade={trade}
        onClose={onClose}
        onSubmit={async (input) => {
          await amendTrade.mutateAsync({ id: trade.id, input });
        }}
      />
    );
  }

  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>(async (_url, init) =>
      init?.method === 'PATCH' ? patchResponse() : json(200, { data: [trade] }),
    );
    vi.stubGlobal('fetch', fetchMock);
    queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: 30_000, retry: false } },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    queryClient.clear();
  });

  it('PATCHes /trades/:id with the form values, refetches the list and closes', async () => {
    patchResponse = () => json(200, { data: { ...trade, price: 190.25 } });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} />, { wrapper });
    await waitFor(() => expect(calls('GET')).toHaveLength(1));

    await fill(user, { Price: '190.25' });
    await user.click(saveButton());

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    const [[url, init]] = calls('PATCH');
    expect(String(url)).toMatch(/\/trades\/trade-1$/);
    expect(JSON.parse(String(init?.body))).toEqual({ ...editable, price: 190.25 });
    await waitFor(() => expect(calls('GET')).toHaveLength(2));
  });

  it('keeps the modal open on a failed PATCH', async () => {
    patchResponse = () => json(409, { error: { code: 'CONFLICT', message: 'Trade is cancelled' } });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} />, { wrapper });

    await user.click(saveButton());

    await waitFor(() => expect(calls('PATCH')).toHaveLength(1));
    await waitFor(() => expect(saveButton()).toBeEnabled());
    expect(onClose).not.toHaveBeenCalled();
  });
});
