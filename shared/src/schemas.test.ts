import { describe, expect, it } from 'vitest';
import {
  MAX_PRICE,
  MAX_QUANTITY,
  amendTradeSchema,
  createTradeSchema,
  tradeListQuerySchema,
} from './schemas.js';

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

  describe('column limits (INTEGER quantity, DECIMAL(12,4) price)', () => {
    function messageFor(input: Record<string, unknown>, field: string) {
      const result = createTradeSchema.safeParse({ ...valid, ...input });
      return result.success
        ? undefined
        : result.error.issues.find((issue) => issue.path[0] === field)?.message;
    }

    it('accepts quantity up to the 32-bit INTEGER max and rejects one above it', () => {
      expect(MAX_QUANTITY).toBe(2 ** 31 - 1);
      expect(messageFor({ quantity: MAX_QUANTITY }, 'quantity')).toBeUndefined();
      expect(messageFor({ quantity: MAX_QUANTITY + 1 }, 'quantity')).toBe('quantity is too large');
    });

    it('accepts price up to the DECIMAL(12,4) max and rejects one tick above it', () => {
      expect(messageFor({ price: MAX_PRICE }, 'price')).toBeUndefined();
      expect(messageFor({ price: 100_000_000 }, 'price')).toBe('price is too large');
    });

    it.each([189.1234, 10.1249, 0.0001, 189.5, 42, MAX_PRICE])(
      'accepts price %s (≤4 decimal places)',
      (price) => {
        expect(messageFor({ price }, 'price')).toBeUndefined();
      },
    );

    it.each([189.12345, 0.00001, 10.12491])('rejects price %s (>4 decimal places)', (price) => {
      expect(messageFor({ price }, 'price')).toBe('price allows at most 4 decimal places');
    });

    it('names a non-integer quantity', () => {
      expect(messageFor({ quantity: 1.5 }, 'quantity')).toBe('quantity must be a whole number');
    });

    it.each([
      ['NaN (an empty number input)', Number.NaN],
      ['null', null],
      ['undefined', undefined],
    ])('reports %s quantity and price as required', (_label, value) => {
      expect(messageFor({ quantity: value }, 'quantity')).toBe('quantity is required');
      expect(messageFor({ price: value }, 'price')).toBe('price is required');
    });

    it('reports a non-numeric quantity and price as "must be a number"', () => {
      expect(messageFor({ quantity: '100' }, 'quantity')).toBe('quantity must be a number');
      expect(messageFor({ price: Infinity }, 'price')).toBe('price must be a number');
    });
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

  it('enforces the same column limits on supplied fields', () => {
    expect(amendTradeSchema.safeParse({ quantity: MAX_QUANTITY + 1 }).success).toBe(false);
    expect(amendTradeSchema.safeParse({ price: 100_000_000 }).success).toBe(false);
    expect(amendTradeSchema.safeParse({ price: 189.12345 }).success).toBe(false);
    expect(amendTradeSchema.safeParse({ quantity: Number.NaN }).success).toBe(false);
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
