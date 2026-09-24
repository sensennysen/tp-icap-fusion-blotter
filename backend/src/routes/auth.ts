import { Router } from 'express';
import { loginSchema } from '@fusion-blotter/shared';
import { UnauthorizedError } from '../lib/errors.js';
import {
  SESSION_COOKIE,
  currentUser,
  encodeSession,
  sessionCookieOptions,
} from '../middleware/auth.js';

export function createAuthRouter(): Router {
  const router = Router();

  router.post('/auth/login', (req, res, next) => {
    try {
      const user = loginSchema.parse(req.body);
      res.cookie(SESSION_COOKIE, encodeSession(user), sessionCookieOptions);
      res.json({ data: user });
    } catch (err) {
      next(err);
    }
  });

  router.post('/auth/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions);
    res.status(204).end();
  });

  router.get('/auth/me', (_req, res, next) => {
    const user = currentUser(res);
    if (!user) {
      next(new UnauthorizedError('Not logged in'));
      return;
    }
    res.json({ data: user });
  });

  return router;
}
