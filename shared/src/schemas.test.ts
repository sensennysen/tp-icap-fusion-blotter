import { describe, expect, it } from 'vitest';
import { createTradeSchema, tradeListQuerySchema } from './schemas.js';

describe('createTradeSchema', () => {
  const valid = {
    symbol: 'AAPL',
    side: 'BUY' as const,
    quantity: 100,
    price: 189.5,
    trader: 'jdoe',
    book: 'EQ-LON-01',
    counterparty: 'GOLDMAN',
  };

  it('accepts a valid trade payload', () => {
    expect(createTradeSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects non-positive quantity', () => {
    const result = createTradeSchema.safeParse({ ...valid, quantity: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects non-positive price', () => {
    const result = createTradeSchema.safeParse({ ...valid, price: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects an empty trader', () => {
    const result = createTradeSchema.safeParse({ ...valid, trader: '' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid side', () => {
    const result = createTradeSchema.safeParse({ ...valid, side: 'HOLD' });
    expect(result.success).toBe(false);
  });
});

describe('tradeListQuerySchema', () => {
  it('accepts an empty query', () => {
    expect(tradeListQuerySchema.safeParse({}).success).toBe(true);
  });

  it('accepts a fully specified query', () => {
    const result = tradeListQuerySchema.safeParse({
      symbol: 'AAPL',
      trader: 'jdoe',
      side: 'SELL',
      status: 'ACTIVE',
      sort: 'tradeTimestamp',
      order: 'desc',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid sort field', () => {
    const result = tradeListQuerySchema.safeParse({ sort: 'notAField' });
    expect(result.success).toBe(false);
  });
});
