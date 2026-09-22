import { Router } from 'express';
import { createTradeSchema, amendTradeSchema, tradeListQuerySchema } from '@fusion-blotter/shared';
import type { TradeService } from '../services/tradeService.js';

export function createTradesRouter(tradeService: TradeService): Router {
  const router = Router();

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

  router.post('/trades', async (req, res, next) => {
    try {
      const input = createTradeSchema.parse(req.body);
      const trade = await tradeService.create(input);
      res.status(201).json({ data: trade });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/trades/:id', async (req, res, next) => {
    try {
      const input = amendTradeSchema.parse(req.body);
      const trade = await tradeService.amend(req.params.id, input);
      res.json({ data: trade });
    } catch (err) {
      next(err);
    }
  });

  router.post('/trades/:id/cancel', async (req, res, next) => {
    try {
      const trade = await tradeService.cancel(req.params.id);
      res.json({ data: trade });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
