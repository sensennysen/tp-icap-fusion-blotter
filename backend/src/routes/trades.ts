import { Router } from 'express';
import { createTradeSchema, amendTradeSchema, tradeListQuerySchema } from '@fusion-blotter/shared';
import type { TradeService } from '../services/tradeService.js';
import { requireRole, sessionUser } from '../middleware/auth.js';

export function createTradesRouter(tradeService: TradeService): Router {
  const router = Router();
  const requireTrader = requireRole('trader');

  router.get('/trades', async (req, res, next) => {
    try {
      const query = tradeListQuerySchema.parse(req.query);
      const trades = await tradeService.list(query);
      res.json({ data: trades });
    } catch (err) {
      next(err);
    }
  });

  router.get('/trades/:id', async (req, res, next) => {
    try {
      const trade = await tradeService.getById(req.params.id);
      res.json({ data: trade });
    } catch (err) {
      next(err);
    }
  });

  router.get('/trades/:id/audit', async (req, res, next) => {
    try {
      const entries = await tradeService.getAuditHistory(req.params.id);
      res.json({ data: entries });
    } catch (err) {
      next(err);
    }
  });

  router.post('/trades', requireTrader, async (req, res, next) => {
    try {
      const input = createTradeSchema.parse(req.body);
      const trade = await tradeService.create(input);
      res.status(201).json({ data: trade });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/trades/:id', requireTrader, async (req, res, next) => {
    try {
      const input = amendTradeSchema.parse(req.body);
      const trade = await tradeService.amend(req.params.id, input, sessionUser(res).username);
      res.json({ data: trade });
    } catch (err) {
      next(err);
    }
  });

  router.post('/trades/:id/cancel', requireTrader, async (req, res, next) => {
    try {
      const trade = await tradeService.cancel(req.params.id, sessionUser(res).username);
      res.json({ data: trade });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
