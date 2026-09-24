import type {
  CreateTradeInput,
  AmendTradeInput,
  TradeListQueryInput,
} from '@fusion-blotter/shared';
import { tradeRepository } from '../repositories/tradeRepository.js';
import { WebSocketBroadcaster } from '../realtime/webSocketBroadcaster.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';

export class TradeService {
  constructor(private readonly broadcaster: WebSocketBroadcaster) {}

  list(query: TradeListQueryInput) {
    return tradeRepository.list(query);
  }

  async getById(id: string) {
    const trade = await tradeRepository.findById(id);
    if (!trade) {
      throw new NotFoundError(`Trade ${id} not found`);
    }
    return trade;
  }

  async create(input: CreateTradeInput) {
    const tradeId = await tradeRepository.nextTradeId();
    const trade = await tradeRepository.create({ tradeId, ...input });
    this.broadcaster.broadcast({ type: 'TRADE_CREATED', payload: trade });
    return trade;
  }

  // The repository writes only to ACTIVE trades, so a null result means the
  // trade is missing (404) or already cancelled (409).
  async amend(id: string, input: AmendTradeInput) {
    const trade = await tradeRepository.update(id, input);
    if (!trade) {
      await this.getById(id);
      throw new ConflictError(`Trade ${id} is cancelled and cannot be amended`);
    }
    this.broadcaster.broadcast({ type: 'TRADE_AMENDED', payload: trade });
    return trade;
  }

  async cancel(id: string) {
    const trade = await tradeRepository.cancel(id);
    if (!trade) {
      await this.getById(id);
      throw new ConflictError(`Trade ${id} is already cancelled`);
    }
    this.broadcaster.broadcast({ type: 'TRADE_CANCELLED', payload: trade });
    return trade;
  }
}
