import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { CreateTradeInput, Trade } from '@fusion-blotter/shared';
import { CreateTradeModal } from '../src/components/CreateTradeModal.js';
import { ApiError } from '../src/lib/apiClient.js';
import { useTrades } from '../src/hooks/useTrades.js';
import { errorFor, field, fill, json, textLabels, valid, validText } from './tradeForm.js';

const submitButton = () => screen.getByRole('button', { name: 'Create Trade' });

function renderModal(onSubmit = vi.fn<(input: CreateTradeInput) => Promise<void>>()) {
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(<CreateTradeModal onClose={onClose} onSubmit={onSubmit} />);
  return { user, onClose, onSubmit };
}

describe('CreateTradeModal', () => {
  it('renders a labelled, focused dialog with every field and BUY as the default side', () => {
    renderModal();

    const dialog = screen.getByRole('dialog', { name: 'New Trade' });
    expect(dialog).toHaveFocus();
    for (const label of textLabels) expect(field(label)).toHaveValue('');
    expect(field('Quantity')).toHaveValue(null);
    expect(field('Price')).toHaveValue(null);
    expect(field('Side')).toHaveValue('BUY');
  });

  it('shows every shared-schema "required" message on an empty submit and never calls onSubmit', async () => {
    const { user, onSubmit, onClose } = renderModal();

    await user.click(submitButton());

    await waitFor(() => expect(errorFor('Symbol')).toBe('symbol is required'));
    expect(errorFor('Quantity')).toBe('quantity is required');
    expect(errorFor('Price')).toBe('price is required');
    expect(errorFor('Trader')).toBe('trader is required');
    expect(errorFor('Book')).toBe('book is required');
    expect(errorFor('Counterparty')).toBe('counterparty is required');
    expect(errorFor('Side')).toBeUndefined();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it.each(textLabels)('rejects a whitespace-only %s with the shared message', async (label) => {
    const { user, onSubmit } = renderModal();

    await fill(user, { ...validText, [label]: '   ' });
    await user.click(submitButton());

    await waitFor(() => expect(errorFor(label)).toBe(`${label.toLowerCase()} is required`));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it.each([
    ['Quantity', '0', 'quantity must be positive'],
    ['Quantity', '-5', 'quantity must be positive'],
    ['Quantity', '1.5', 'quantity must be a whole number'],
    ['Quantity', '2147483648', 'quantity is too large'],
    ['Price', '0', 'price must be positive'],
    ['Price', '189.12345', 'price allows at most 4 decimal places'],
    ['Price', '100000000', 'price is too large'],
  ])('rejects %s = %s with "%s"', async (label, value, message) => {
    const { user, onSubmit } = renderModal();

    await fill(user, { ...validText, [label]: value });
    await user.click(submitButton());

    await waitFor(() => expect(errorFor(label)).toBe(message));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('accepts the column limits (INTEGER max quantity, 4dp price)', async () => {
    const { user, onSubmit } = renderModal(vi.fn().mockResolvedValue(undefined));

    await fill(user, { ...validText, Quantity: '2147483647', Price: '10.1249' });
    await user.click(submitButton());

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ ...valid, quantity: 2_147_483_647, price: 10.1249 }),
    );
  });

  it('submits the exact parsed payload (numbers, trimmed text, chosen side) and then closes', async () => {
    const { user, onSubmit, onClose } = renderModal(vi.fn().mockResolvedValue(undefined));

    await fill(user, { ...validText, Symbol: ' AAPL ', Trader: ' jdoe ', Side: 'SELL' });
    await user.click(submitButton());

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ ...valid, side: 'SELL' });
  });

  it('disables submit while pending and closes only once onSubmit resolves', async () => {
    let resolve!: () => void;
    const onSubmit = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    const { user, onClose } = renderModal(onSubmit);

    await fill(user, validText);
    await user.click(submitButton());

    await waitFor(() => expect(submitButton()).toBeDisabled());
    expect(onClose).not.toHaveBeenCalled();

    resolve();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('stays open with the input intact when onSubmit rejects', async () => {
    const { user, onSubmit, onClose } = renderModal(
      vi.fn().mockRejectedValue(new ApiError(500, 'INTERNAL', 'boom')),
    );

    await fill(user, validText);
    await user.click(submitButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(submitButton()).toBeEnabled());
    expect(onClose).not.toHaveBeenCalled();
    expect(field('Symbol')).toHaveValue('AAPL');
    expect(field('Price')).toHaveValue(189.5);
    for (const label of [...textLabels, 'Quantity', 'Price']) {
      expect(errorFor(label)).toBeUndefined();
    }
  });

  it('shows server field errors under the matching inputs and ignores unknown keys', async () => {
    const { user, onClose } = renderModal(
      vi.fn().mockRejectedValue(
        new ApiError(400, 'VALIDATION_ERROR', 'Invalid request payload', {
          symbol: 'symbol is not tradable',
          price: 'price is off-market',
          _: 'payload rejected',
        }),
      ),
    );

    await fill(user, validText);
    await user.click(submitButton());

    await waitFor(() => expect(errorFor('Symbol')).toBe('symbol is not tradable'));
    expect(errorFor('Price')).toBe('price is off-market');
    expect(errorFor('Trader')).toBeUndefined();
    expect(screen.queryByText('payload rejected')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it.each([
    [
      'the Cancel button',
      (user: UserEvent) => user.click(screen.getByRole('button', { name: 'Cancel' })),
    ],
    [
      'the × button',
      (user: UserEvent) => user.click(screen.getByRole('button', { name: 'Close' })),
    ],
    ['Escape', (user: UserEvent) => user.keyboard('{Escape}')],
  ])('closes without submitting via %s', async (_label, dismiss) => {
    const { user, onSubmit, onClose } = renderModal();

    await fill(user, validText);
    await dismiss(user);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('stops listening for Escape once unmounted', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { unmount } = render(<CreateTradeModal onClose={onClose} onSubmit={vi.fn()} />);

    unmount();
    await user.keyboard('{Escape}');

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('CreateTradeModal wired to useTrades().createTrade', () => {
  const created: Trade = {
    ...valid,
    id: 'trade-new',
    tradeId: 'TRD-100501',
    tradeTimestamp: '2026-09-24T09:00:00.000Z',
    status: 'ACTIVE',
    createdAt: '2026-09-24T09:00:00.000Z',
    updatedAt: '2026-09-24T09:00:00.000Z',
  };

  let queryClient: QueryClient;
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  let postResponse: () => Response;

  const calls = (method: string) =>
    fetchMock.mock.calls.filter(([, init]) => (init?.method ?? 'GET') === method);

  function Harness({ onClose }: { onClose: () => void }) {
    const { createTrade } = useTrades({});
    return (
      <CreateTradeModal
        onClose={onClose}
        onSubmit={async (input) => {
          await createTrade.mutateAsync(input);
        }}
      />
    );
  }

  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>(async (_url, init) =>
      init?.method === 'POST' ? postResponse() : json(200, { data: [] }),
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

  it('POSTs the parsed payload to /trades through the real apiClient, refetches the list and closes', async () => {
    postResponse = () => json(201, { data: created });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} />, { wrapper });
    await waitFor(() => expect(calls('GET')).toHaveLength(1));

    await fill(user, validText);
    await user.click(submitButton());

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    const [[url, init]] = calls('POST');
    expect(String(url)).toMatch(/\/trades$/);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual(valid);
    // onSuccess invalidates the trades key, so the active list refetches.
    await waitFor(() => expect(calls('GET')).toHaveLength(2));
  });

  it('keeps the modal open and maps a 400 envelope onto the fields', async () => {
    postResponse = () =>
      json(400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request payload',
          fields: { counterparty: 'counterparty is not onboarded' },
        },
      });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} />, { wrapper });

    await fill(user, validText);
    await user.click(submitButton());

    await waitFor(() => expect(errorFor('Counterparty')).toBe('counterparty is not onboarded'));
    expect(calls('POST')).toHaveLength(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(field('Counterparty')).toHaveValue('GOLDMAN');
  });
});
