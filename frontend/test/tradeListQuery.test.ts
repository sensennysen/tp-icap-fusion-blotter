import { describe, expect, it } from 'vitest';
import type { TradeListQuery } from '@fusion-blotter/shared';
import { normalizeTradeListQuery } from '../src/lib/tradeListQuery.js';

describe('normalizeTradeListQuery', () => {
  it('trims symbol and trader', () => {
    expect(normalizeTradeListQuery({ symbol: '  AAPL ', trader: '\tjdoe\n' })).toEqual({
      symbol: 'AAPL',
      trader: 'jdoe',
    });
  });

  it('keeps inner whitespace in text filters', () => {
    expect(normalizeTradeListQuery({ trader: ' j doe ' })).toEqual({ trader: 'j doe' });
  });

  it.each([
    ['empty', ''],
    ['whitespace-only', '   '],
  ])('drops %s text filters', (_label, value) => {
    const result = normalizeTradeListQuery({ symbol: value, trader: value, side: 'BUY' });

    expect(result).toEqual({ side: 'BUY' });
    expect(result).not.toHaveProperty('symbol');
    expect(result).not.toHaveProperty('trader');
  });

  it('drops undefined fields rather than keeping them as keys', () => {
    const result = normalizeTradeListQuery({
      symbol: undefined,
      trader: undefined,
      side: undefined,
      status: undefined,
      sort: undefined,
      order: undefined,
    });

    expect(Object.keys(result)).toEqual([]);
  });

  it('passes side, status, sort and order through unchanged', () => {
    const query: TradeListQuery = {
      side: 'SELL',
      status: 'CANCELLED',
      sort: 'price',
      order: 'asc',
    };

    expect(normalizeTradeListQuery(query)).toEqual(query);
  });

  it('does not mutate its input', () => {
    const query: TradeListQuery = { symbol: ' AAPL ', trader: '' };
    normalizeTradeListQuery(query);

    expect(query).toEqual({ symbol: ' AAPL ', trader: '' });
  });

  it('is idempotent', () => {
    const once = normalizeTradeListQuery({ symbol: ' MSFT ', trader: ' ', status: 'ACTIVE' });

    expect(normalizeTradeListQuery(once)).toEqual(once);
  });
});
