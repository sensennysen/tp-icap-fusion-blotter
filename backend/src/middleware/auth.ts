import type { CookieOptions, NextFunction, Request, RequestHandler, Response } from 'express';
import { loginSchema, type AuthUser, type Role } from '@fusion-blotter/shared';
import { env } from '../config/env.js';
import { ForbiddenError, UnauthorizedError } from '../lib/errors.js';

// MOCK AUTH (bonus TASK-002): the session cookie is unsigned base64url JSON of
// the user picked at login. It is re-validated on every request, so a garbled
// or tampered cookie reads as "no session" — but anyone can forge one. Never
// reuse this pattern for real authentication.
export const SESSION_COOKIE = 'fusion_session';

export const sessionCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.AUTH_COOKIE_SECURE,
  path: '/',
};

export function encodeSession(user: AuthUser): string {
  return Buffer.from(JSON.stringify(user)).toString('base64url');
}

export function decodeSession(raw: unknown): AuthUser | null {
  if (typeof raw !== 'string') return null;
  try {
    const result = loginSchema.safeParse(JSON.parse(Buffer.from(raw, 'base64url').toString()));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

// Sets res.locals.user when the request carries a valid session; never rejects.
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const user = decodeSession(req.cookies?.[SESSION_COOKIE]);
  if (user) res.locals.user = user;
  next();
}

export function currentUser(res: Response): AuthUser | undefined {
  return res.locals.user as AuthUser | undefined;
}

// For handlers behind requireRole; throws rather than trusting the guard ran.
export function sessionUser(res: Response): AuthUser {
  const user = currentUser(res);
  if (!user) throw new UnauthorizedError('Log in to perform this action');
  return user;
}

// Typed as a param-agnostic RequestHandler so Express still infers the route's
// path params (e.g. req.params.id: string) for the handler that follows.
export function requireRole(role: Role): RequestHandler<Record<string, string>> {
  return (_req, res, next) => {
    const user = currentUser(res);
    if (!user) {
      next(new UnauthorizedError('Log in to perform this action'));
      return;
    }
    if (user.role !== role) {
      next(new ForbiddenError(`Only a ${role} can perform this action`));
      return;
    }
    next();
  };
}
