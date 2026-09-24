import type { AuthUser } from '@fusion-blotter/shared';
import { SESSION_COOKIE, encodeSession } from '../../src/middleware/auth.js';

// A Cookie header value for a mock-auth session, for mutation requests that
// sit behind requireRole('trader').
export function sessionCookie(user: Partial<AuthUser> = {}): string {
  return `${SESSION_COOKIE}=${encodeSession({ username: 'jdoe', role: 'trader', ...user })}`;
}
