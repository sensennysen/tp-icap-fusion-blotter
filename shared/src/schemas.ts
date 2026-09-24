import { z } from 'zod';

export const sideSchema = z.enum(['BUY', 'SELL']);

export const tradeStatusSchema = z.enum(['ACTIVE', 'CANCELLED']);

// Column limits from database/schema.prisma: quantity is a 32-bit INTEGER,
// price is DECIMAL(12,4) — 8 integer digits and 4 decimal places.
export const MAX_QUANTITY = 2_147_483_647;
export const MAX_PRICE = 99_999_999.9999;

// Missing values (including the NaN an empty number input yields) read as
// "required"; anything else that isn't a finite number reads as "must be a number".
function numberError(field: string) {
  return (issue: { input?: unknown }) =>
    issue.input === undefined || issue.input === null || Number.isNaN(issue.input)
      ? `${field} is required`
      : `${field} must be a number`;
}

export const createTradeSchema = z.object({
  symbol: z.string().trim().min(1, 'symbol is required'),
  side: sideSchema,
  quantity: z
    .number({ error: numberError('quantity') })
    .int('quantity must be a whole number')
    .positive('quantity must be positive')
    .max(MAX_QUANTITY, 'quantity is too large'),
  price: z
    .number({ error: numberError('price') })
    .positive('price must be positive')
    .max(MAX_PRICE, 'price is too large')
    // toFixed(4) round-trips any value with ≤4dp to the same double, so this
    // has no float tolerance to tune.
    .refine((value) => Number(value.toFixed(4)) === value, 'price allows at most 4 decimal places'),
  trader: z.string().trim().min(1, 'trader is required'),
  book: z.string().trim().min(1, 'book is required'),
  counterparty: z.string().trim().min(1, 'counterparty is required'),
});

export type CreateTradeInput = z.infer<typeof createTradeSchema>;

export const amendTradeSchema = createTradeSchema.partial();

export type AmendTradeInput = z.infer<typeof amendTradeSchema>;

export const tradeListQuerySchema = z.object({
  symbol: z.string().trim().min(1).optional(),
  trader: z.string().trim().min(1).optional(),
  side: sideSchema.optional(),
  status: tradeStatusSchema.optional(),
  sort: z.enum(['symbol', 'trader', 'tradeTimestamp', 'price', 'quantity']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

export type TradeListQueryInput = z.infer<typeof tradeListQuerySchema>;
