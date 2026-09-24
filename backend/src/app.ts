import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authenticate } from './middleware/auth.js';
import { healthRouter } from './routes/health.js';
import { createAuthRouter } from './routes/auth.js';
import { createTradesRouter } from './routes/trades.js';
import type { TradeService } from './services/tradeService.js';

export function createApp(tradeService: TradeService): Express {
  const app = express();

  app.use(helmet());
  // credentials: the frontend is a different origin, so the browser only
  // sends/stores the session cookie when both sides opt in.
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(requestLogger);
  app.use(authenticate);

  app.use(healthRouter);
  app.use('/api', createAuthRouter());
  app.use('/api', createTradesRouter(tradeService));

  app.use(errorHandler);

  return app;
}
