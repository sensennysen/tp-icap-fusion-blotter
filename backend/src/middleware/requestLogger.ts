import { pinoHttp } from 'pino-http';
import { logger } from '../lib/logger.js';

// The Cookie header carries the mock-auth session, and Set-Cookie issues it.
export const requestLogger = pinoHttp({
  logger,
  redact: ['req.headers.cookie', 'res.headers["set-cookie"]'],
});
