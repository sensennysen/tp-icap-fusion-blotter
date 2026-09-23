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

const createInput = {
  symbol: 'AAPL',
  side: 'BUY',
  quantity: 100,
  price: 189.5,
  trader: 'jdoe',
  book: 'EQ-LON-01',
  counterparty: 'GOLDMAN',
} as const;

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
    vi.resetAllMocks();
    broadcast = vi.fn();
    service = new TradeService({ broadcast } as never);
  });

  describe('list', () => {
    it('delegates to the repository with the query and returns its result', async () => {
      vi.mocked(tradeRepository.list).mockResolvedValue([baseTrade]);
      const query = { symbol: 'AAPL', sort: 'price', order: 'asc' } as const;

      const result = await service.list(query);

      expect(result).toEqual([baseTrade]);
      expect(tradeRepository.list).toHaveBeenCalledExactlyOnceWith(query);
      expect(broadcast).not.toHaveBeenCalled();
    });
  });

  describe('getById', () => {
    it('returns the trade when it exists', async () => {
      vi.mocked(tradeRepository.findById).mockResolvedValue(baseTrade);
      await expect(service.getById('trade-1')).resolves.toEqual(baseTrade);
      expect(tradeRepository.findById).toHaveBeenCalledExactlyOnceWith('trade-1');
    });

    it('throws NotFoundError (404) when the trade is missing', async () => {
      vi.mocked(tradeRepository.findById).mockResolvedValue(null);

      const err = await service.getById('missing').catch((e: unknown) => e);

      expect(err).toBeInstanceOf(NotFoundError);
      expect(err).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
      expect(broadcast).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('creates a trade and broadcasts TRADE_CREATED exactly once', async () => {
      vi.mocked(tradeRepository.nextTradeId).mockResolvedValue('TRD-100001');
      vi.mocked(tradeRepository.create).mockResolvedValue(baseTrade);

      const result = await service.create(createInput);

      expect(result).toEqual(baseTrade);
      expect(broadcast).toHaveBeenCalledTimes(1);
      expect(broadcast).toHaveBeenCalledWith({ type: 'TRADE_CREATED', payload: baseTrade });
    });

    it('passes the generated tradeId alongside the input to the repository', async () => {
      vi.mocked(tradeRepository.nextTradeId).mockResolvedValue('TRD-100042');
      vi.mocked(tradeRepository.create).mockResolvedValue({ ...baseTrade, tradeId: 'TRD-100042' });

      await service.create(createInput);

      expect(tradeRepository.nextTradeId).toHaveBeenCalledTimes(1);
      expect(tradeRepository.create).toHaveBeenCalledExactlyOnceWith({
        tradeId: 'TRD-100042',
        ...createInput,
      });
    });

    it('does not broadcast when the repository rejects', async () => {
      vi.mocked(tradeRepository.nextTradeId).mockResolvedValue('TRD-100001');
      vi.mocked(tradeRepository.create).mockRejectedValue(new Error('db down'));

      await expect(service.create(createInput)).rejects.toThrow('db down');
      expect(broadcast).not.toHaveBeenCalled();
    });
  });

  describe('amend', () => {
    it('amends an active trade and broadcasts TRADE_AMENDED exactly once', async () => {
      vi.mocked(tradeRepository.findById).mockResolvedValue(baseTrade);
      const amended: Trade = { ...baseTrade, quantity: 250 };
      vi.mocked(tradeRepository.update).mockResolvedValue(amended);

      const result = await service.amend('trade-1', { quantity: 250 });

      expect(result).toEqual(amended);
      expect(tradeRepository.update).toHaveBeenCalledExactlyOnceWith('trade-1', { quantity: 250 });
      expect(broadcast).toHaveBeenCalledTimes(1);
      expect(broadcast).toHaveBeenCalledWith({ type: 'TRADE_AMENDED', payload: amended });
    });

    it('rejects amending a cancelled trade with ConflictError (409) and does nothing else', async () => {
      vi.mocked(tradeRepository.findById).mockResolvedValue({ ...baseTrade, status: 'CANCELLED' });

      const err = await service.amend('trade-1', { quantity: 200 }).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ConflictError);
      expect(err).toMatchObject({ statusCode: 409, code: 'CONFLICT' });
      expect(tradeRepository.update).not.toHaveBeenCalled();
      expect(broadcast).not.toHaveBeenCalled();
    });

    // The repository throws a raw Prisma P2025 on an unknown id, so the 404 only
    // exists because the service looks the trade up first.
    it('throws NotFoundError for a missing trade without touching update or broadcast', async () => {
      vi.mocked(tradeRepository.findById).mockResolvedValue(null);

      await expect(service.amend('missing', { quantity: 200 })).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(tradeRepository.update).not.toHaveBeenCalled();
      expect(broadcast).not.toHaveBeenCalled();
    });

    it('does not broadcast when the repository update rejects', async () => {
      vi.mocked(tradeRepository.findById).mockResolvedValue(baseTrade);
      vi.mocked(tradeRepository.update).mockRejectedValue(new Error('db down'));

      await expect(service.amend('trade-1', { quantity: 200 })).rejects.toThrow('db down');
      expect(broadcast).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('cancels an active trade and broadcasts TRADE_CANCELLED exactly once', async () => {
      vi.mocked(tradeRepository.findById).mockResolvedValue(baseTrade);
      const cancelled: Trade = { ...baseTrade, status: 'CANCELLED' };
      vi.mocked(tradeRepository.cancel).mockResolvedValue(cancelled);

      const result = await service.cancel('trade-1');

      expect(result.status).toBe('CANCELLED');
      expect(tradeRepository.cancel).toHaveBeenCalledExactlyOnceWith('trade-1');
      expect(broadcast).toHaveBeenCalledTimes(1);
      expect(broadcast).toHaveBeenCalledWith({ type: 'TRADE_CANCELLED', payload: cancelled });
    });

    it('rejects cancelling an already-cancelled trade with ConflictError (409) and does nothing else', async () => {
      vi.mocked(tradeRepository.findById).mockResolvedValue({ ...baseTrade, status: 'CANCELLED' });

      const err = await service.cancel('trade-1').catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ConflictError);
      expect(err).toMatchObject({ statusCode: 409, code: 'CONFLICT' });
      expect(tradeRepository.cancel).not.toHaveBeenCalled();
      expect(broadcast).not.toHaveBeenCalled();
    });

    it('throws NotFoundError for a missing trade without touching cancel or broadcast', async () => {
      vi.mocked(tradeRepository.findById).mockResolvedValue(null);

      await expect(service.cancel('missing')).rejects.toBeInstanceOf(NotFoundError);
      expect(tradeRepository.cancel).not.toHaveBeenCalled();
      expect(broadcast).not.toHaveBeenCalled();
    });

    it('does not broadcast when the repository cancel rejects', async () => {
      vi.mocked(tradeRepository.findById).mockResolvedValue(baseTrade);
      vi.mocked(tradeRepository.cancel).mockRejectedValue(new Error('db down'));

      await expect(service.cancel('trade-1')).rejects.toThrow('db down');
      expect(broadcast).not.toHaveBeenCalled();
    });

    it('broadcasts once for a double-cancel: the second call is a conflict', async () => {
      const cancelled: Trade = { ...baseTrade, status: 'CANCELLED' };
      vi.mocked(tradeRepository.findById)
        .mockResolvedValueOnce(baseTrade)
        .mockResolvedValueOnce(cancelled);
      vi.mocked(tradeRepository.cancel).mockResolvedValue(cancelled);

      await service.cancel('trade-1');
      await expect(service.cancel('trade-1')).rejects.toBeInstanceOf(ConflictError);

      expect(tradeRepository.cancel).toHaveBeenCalledTimes(1);
      expect(broadcast).toHaveBeenCalledTimes(1);
    });
  });

  describe('known gaps', () => {
    // amend/cancel are findById -> update/cancel with no transaction or conditional
    // write, so two concurrent cancels can both pass the guard and both broadcast
    // TRADE_CANCELLED. A mocked repository cannot express this; the fix (updateMany
    // where status = ACTIVE, or a transaction) belongs in the repository.
    it.todo('does not broadcast twice for two concurrent cancels of the same trade');
  });
});
