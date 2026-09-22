import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Trade } from '@fusion-blotter/shared';

const baseTrade: Trade = {
  id: 'trade-1',
  tradeId: 'TRD-100001',
  symbol: 'AAPL',
  side: 'BUY',
  quantity: 100,
  price: 189.5,
  trader: 'jdoe',
  book: 'EQ-LON-01',
  counterparty: 'GOLDMAN',
  tradeTimestamp: new Date().toISOString(),
  status: 'ACTIVE',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

vi.mock('../src/repositories/tradeRepository.js', () => ({
  tradeRepository: {
    list: vi.fn(),
    findById: vi.fn(),
    nextTradeId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    cancel: vi.fn(),
  },
}));

const { tradeRepository } = await import('../src/repositories/tradeRepository.js');
const { TradeService } = await import('../src/services/tradeService.js');
const { ConflictError, NotFoundError } = await import('../src/lib/errors.js');

describe('TradeService', () => {
  let broadcast: ReturnType<typeof vi.fn>;
  let service: InstanceType<typeof TradeService>;

  beforeEach(() => {
    vi.clearAllMocks();
    broadcast = vi.fn();
    service = new TradeService({ broadcast } as never);
  });

  it('creates a trade and broadcasts TRADE_CREATED', async () => {
    vi.mocked(tradeRepository.nextTradeId).mockResolvedValue('TRD-100001');
    vi.mocked(tradeRepository.create).mockResolvedValue(baseTrade);

    const result = await service.create({
      symbol: 'AAPL',
      side: 'BUY',
      quantity: 100,
      price: 189.5,
      trader: 'jdoe',
      book: 'EQ-LON-01',
      counterparty: 'GOLDMAN',
    });

    expect(result).toEqual(baseTrade);
    expect(broadcast).toHaveBeenCalledWith({ type: 'TRADE_CREATED', payload: baseTrade });
  });

  it('throws NotFoundError when getting a missing trade', async () => {
    vi.mocked(tradeRepository.findById).mockResolvedValue(null);
    await expect(service.getById('missing')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects amending a cancelled trade with ConflictError', async () => {
    vi.mocked(tradeRepository.findById).mockResolvedValue({ ...baseTrade, status: 'CANCELLED' });
    await expect(service.amend('trade-1', { quantity: 200 })).rejects.toBeInstanceOf(ConflictError);
    expect(broadcast).not.toHaveBeenCalled();
  });

  it('rejects cancelling an already-cancelled trade with ConflictError', async () => {
    vi.mocked(tradeRepository.findById).mockResolvedValue({ ...baseTrade, status: 'CANCELLED' });
    await expect(service.cancel('trade-1')).rejects.toBeInstanceOf(ConflictError);
  });

  it('cancels an active trade and broadcasts TRADE_CANCELLED', async () => {
    vi.mocked(tradeRepository.findById).mockResolvedValue(baseTrade);
    const cancelled: Trade = { ...baseTrade, status: 'CANCELLED' };
    vi.mocked(tradeRepository.cancel).mockResolvedValue(cancelled);

    const result = await service.cancel('trade-1');

    expect(result.status).toBe('CANCELLED');
    expect(broadcast).toHaveBeenCalledWith({ type: 'TRADE_CANCELLED', payload: cancelled });
  });
});
