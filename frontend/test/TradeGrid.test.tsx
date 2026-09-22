import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Trade } from '@fusion-blotter/shared';
import { TradeGrid } from '../src/components/TradeGrid.js';

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
  tradeTimestamp: new Date('2026-01-01').toISOString(),
  status: 'ACTIVE',
  createdAt: new Date('2026-01-01').toISOString(),
  updatedAt: new Date('2026-01-01').toISOString(),
};

describe('TradeGrid', () => {
  it('shows a loading message while loading', () => {
    render(<TradeGrid trades={[]} isLoading onAmend={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/loading trades/i)).toBeInTheDocument();
  });

  it('shows an empty state when there are no trades', () => {
    render(<TradeGrid trades={[]} isLoading={false} onAmend={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/no trades match/i)).toBeInTheDocument();
  });

  it('renders a row per trade with its trade ID', () => {
    render(<TradeGrid trades={[trade]} isLoading={false} onAmend={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('TRD-100001')).toBeInTheDocument();
  });

  it('hides amend/cancel actions for a cancelled trade', () => {
    render(
      <TradeGrid
        trades={[{ ...trade, status: 'CANCELLED' }]}
        isLoading={false}
        onAmend={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByText('Amend')).not.toBeInTheDocument();
    expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
  });
});
