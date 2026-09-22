import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { healthRouter } from './routes/health.js';
import { createTradesRouter } from './routes/trades.js';
import type { TradeService } from './services/tradeService.js';

export function createApp(tradeService: TradeService): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json({ limit: '100kb' }));
  app.use(requestLogger);

  app.use(healthRouter);
  app.use('/api', createTradesRouter(tradeService));

  app.use(errorHandler);

  return app;
}
