import { z } from 'zod';

export const sideSchema = z.enum(['BUY', 'SELL']);

export const tradeStatusSchema = z.enum(['ACTIVE', 'CANCELLED']);

export const createTradeSchema = z.object({
  symbol: z.string().trim().min(1, 'symbol is required'),
  side: sideSchema,
  quantity: z.number().int().positive('quantity must be positive'),
  price: z.number().positive('price must be positive'),
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
