import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import type { CreateTradeInput } from '@fusion-blotter/shared';

// Shared by CreateTradeModal.test.tsx and AmendTradeModal.test.tsx.

export const valid: CreateTradeInput = {
  symbol: 'AAPL',
  side: 'BUY',
  quantity: 100,
  price: 189.5,
  trader: 'jdoe',
  book: 'EQ-LON-01',
  counterparty: 'GOLDMAN',
};

export const textLabels = ['Symbol', 'Trader', 'Book', 'Counterparty'] as const;

// Scoped to the open dialog (the page's filter bar also has Symbol/Side/Trader).
// The <label> wraps the control and its error, so match on the label prefix.
export const field = (label: string) =>
  within(screen.getByRole('dialog')).getByLabelText(new RegExp(`^${label}`));

export function errorFor(label: string) {
  const container = field(label).closest('label');
  if (!container) throw new Error(`no label for ${label}`);
  return within(container).queryByRole('alert')?.textContent;
}

export async function fill(user: UserEvent, values: Partial<Record<string, string>>) {
  for (const [label, value] of Object.entries(values)) {
    const control = field(label);
    if (control instanceof HTMLSelectElement) {
      await user.selectOptions(control, value!);
    } else {
      await user.clear(control);
      if (value) await user.type(control, value);
    }
  }
}

export const validText = {
  Symbol: 'AAPL',
  Quantity: '100',
  Price: '189.50',
  Trader: 'jdoe',
  Book: 'EQ-LON-01',
  Counterparty: 'GOLDMAN',
};

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
