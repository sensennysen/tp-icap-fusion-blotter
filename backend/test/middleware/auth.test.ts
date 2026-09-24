import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import {
  authenticate,
  decodeSession,
  encodeSession,
  requireRole,
  SESSION_COOKIE,
  sessionUser,
} from '../../src/middleware/auth.js';
import { ForbiddenError, UnauthorizedError } from '../../src/lib/errors.js';

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

function fakeRes(user?: unknown): Response {
  return { locals: user === undefined ? {} : { user } } as unknown as Response;
}

describe('decodeSession', () => {
  it('round-trips a session made by encodeSession', () => {
    const user = { username: 'jdoe', role: 'trader' } as const;

    expect(decodeSession(encodeSession(user))).toEqual(user);
  });

  it('trims the username the same way login does', () => {
    expect(decodeSession(b64({ username: '  jdoe ', role: 'viewer' }))).toEqual({
      username: 'jdoe',
      role: 'viewer',
    });
  });

  it.each([
    ['a missing cookie', undefined],
    ['a non-string cookie', 42],
    ['garbled base64', '%%%not-base64%%%'],
    ['base64 that is not JSON', Buffer.from('not json').toString('base64url')],
    ['the wrong shape', b64({ name: 'jdoe' })],
    ['an unknown role', b64({ username: 'jdoe', role: 'admin' })],
    ['a blank username', b64({ username: '   ', role: 'trader' })],
  ])('returns null for %s', (_, raw) => {
    expect(decodeSession(raw)).toBeNull();
  });
});

describe('authenticate', () => {
  it('puts a valid session user on res.locals', () => {
    const res = fakeRes();
    const next = vi.fn();
    const req = {
      cookies: { [SESSION_COOKIE]: encodeSession({ username: 'jdoe', role: 'trader' }) },
    };

    authenticate(req as unknown as Request, res, next);

    expect(res.locals.user).toEqual({ username: 'jdoe', role: 'trader' });
    expect(next).toHaveBeenCalledExactlyOnceWith();
  });

  it('never rejects: an invalid or missing cookie just leaves no user', () => {
    for (const cookies of [{ [SESSION_COOKIE]: 'garbage' }, {}, undefined]) {
      const res = fakeRes();
      const next = vi.fn();

      authenticate({ cookies } as unknown as Request, res, next);

      expect(res.locals.user).toBeUndefined();
      expect(next).toHaveBeenCalledExactlyOnceWith();
    }
  });
});

describe('requireRole', () => {
  const guard = requireRole('trader');
  const run = (user?: unknown) => {
    const next = vi.fn();
    guard({} as Parameters<typeof guard>[0], fakeRes(user), next);
    return next.mock.calls[0]?.[0];
  };

  it('rejects a request with no session as 401', () => {
    expect(run()).toBeInstanceOf(UnauthorizedError);
  });

  it('rejects a user with another role as 403', () => {
    expect(run({ username: 'jdoe', role: 'viewer' })).toBeInstanceOf(ForbiddenError);
  });

  it('lets the required role through', () => {
    expect(run({ username: 'jdoe', role: 'trader' })).toBeUndefined();
  });
});

describe('sessionUser', () => {
  it('returns the session user', () => {
    expect(sessionUser(fakeRes({ username: 'jdoe', role: 'trader' }))).toEqual({
      username: 'jdoe',
      role: 'trader',
    });
  });

  it('throws 401 rather than trusting that a guard ran', () => {
    expect(() => sessionUser(fakeRes())).toThrow(UnauthorizedError);
  });
});
