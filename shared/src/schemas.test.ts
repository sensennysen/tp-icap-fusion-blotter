import { describe, expect, it } from 'vitest';
import { amendTradeSchema, createTradeSchema, tradeListQuerySchema } from './schemas.js';

const valid = {
  symbol: 'AAPL',
  side: 'BUY' as const,
  quantity: 100,
  price: 189.5,
  trader: 'jdoe',
  book: 'EQ-LON-01',
  counterparty: 'GOLDMAN',
};

describe('createTradeSchema', () => {
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

  it.each(['symbol', 'trader', 'book', 'counterparty'] as const)(
    'rejects an empty or whitespace-only %s',
    (field) => {
      expect(createTradeSchema.safeParse({ ...valid, [field]: '' }).success).toBe(false);
      expect(createTradeSchema.safeParse({ ...valid, [field]: '   ' }).success).toBe(false);
    },
  );

  it('rejects a non-integer quantity', () => {
    expect(createTradeSchema.safeParse({ ...valid, quantity: 1.5 }).success).toBe(false);
  });

  it('rejects a string-typed quantity or price', () => {
    expect(createTradeSchema.safeParse({ ...valid, quantity: '100' }).success).toBe(false);
    expect(createTradeSchema.safeParse({ ...valid, price: '189.5' }).success).toBe(false);
  });

  it('rejects a payload with a missing field', () => {
    const withoutBook: Partial<typeof valid> = { ...valid };
    delete withoutBook.book;
    expect(createTradeSchema.safeParse(withoutBook).success).toBe(false);
  });

  it('trims surrounding whitespace from string fields', () => {
    const result = createTradeSchema.parse({ ...valid, symbol: ' AAPL ', trader: ' jdoe ' });
    expect(result.symbol).toBe('AAPL');
    expect(result.trader).toBe('jdoe');
  });

  it('reports field-level messages for non-positive quantity and price', () => {
    const result = createTradeSchema.safeParse({ ...valid, quantity: 0, price: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = Object.fromEntries(result.error.issues.map((i) => [i.path[0], i.message]));
      expect(messages.quantity).toBe('quantity must be positive');
      expect(messages.price).toBe('price must be positive');
    }
  });
});

describe('amendTradeSchema', () => {
  it('accepts a single-field payload', () => {
    expect(amendTradeSchema.safeParse({ price: 190 }).success).toBe(true);
  });

  it('accepts a full payload', () => {
    expect(amendTradeSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts an empty payload (current behavior — a no-op amend is not rejected)', () => {
    expect(amendTradeSchema.safeParse({}).success).toBe(true);
  });

  it('still rejects invalid values on supplied fields', () => {
    expect(amendTradeSchema.safeParse({ quantity: 0 }).success).toBe(false);
    expect(amendTradeSchema.safeParse({ price: -1 }).success).toBe(false);
    expect(amendTradeSchema.safeParse({ side: 'HOLD' }).success).toBe(false);
    expect(amendTradeSchema.safeParse({ trader: '' }).success).toBe(false);
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

  it.each([
    ['side', 'HOLD'],
    ['status', 'PENDING'],
    ['order', 'sideways'],
    ['symbol', ''],
    ['trader', ''],
  ])('rejects an invalid %s', (field, value) => {
    expect(tradeListQuerySchema.safeParse({ [field]: value }).success).toBe(false);
  });

  it.each(['symbol', 'trader', 'tradeTimestamp', 'price', 'quantity'])(
    'accepts %s as a sort field',
    (sort) => {
      expect(tradeListQuerySchema.safeParse({ sort }).success).toBe(true);
    },
  );
});
