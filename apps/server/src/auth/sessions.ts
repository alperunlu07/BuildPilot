// Cluster 11.A — session cookie + middleware.
//
// Sessions are random 32-byte hex tokens stored in the `sessions` table
// alongside a userId, creation time, last-seen time, and expiry. A signed
// httpOnly cookie carries the token; we sign with `auth.sessionSecret` so
// stolen cookies can't be replayed without the server key.
//
// The middleware is wired unconditionally in `index.ts`, but it only
// *enforces* (HTTP 401 on protected routes) when `config.auth.enabled === true`.
// When the flag is off everything behaves identically to today and request.user
// stays `null`.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { parse as parseCookie, serialize as serializeCookie } from 'cookie';
import bcrypt from 'bcryptjs';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { User } from '@buildpilot/shared-types';
import { getDb } from '../store/db';
import { getAuthConfigRuntime } from '../config';
import { getUser } from './users';

export const SESSION_COOKIE_NAME = 'buildpilot.sid';
// 30 days. Long enough to feel like "stay logged in", short enough that a
// stolen laptop has a hard expiry to fall back on.
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface SessionRow {
  id: string;
  user_id: string;
  created_at: number;
  last_seen_at: number;
  expires_at: number;
}

// Augment Fastify's request type so middleware can attach a resolved user
// once for the lifetime of the request.
declare module 'fastify' {
  interface FastifyRequest {
    user?: User | null;
    sessionId?: string | null;
    // Set to true when the request was authenticated by an API token rather
    // than a session cookie. Useful for the audit hook so we can tell
    // browser actions apart from CI script calls in the log.
    authViaApiToken?: boolean;
  }
}

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

// `<token>.<hmac>` — the dot-separator never appears in hex so there's no
// ambiguity. The signature lets us reject obviously-tampered cookies before
// hitting the DB.
function encodeCookie(token: string, secret: string): string {
  return `${token}.${sign(token, secret)}`;
}

function decodeCookie(raw: string, secret: string): string | null {
  const idx = raw.indexOf('.');
  if (idx <= 0) return null;
  const token = raw.slice(0, idx);
  const sig = raw.slice(idx + 1);
  const expected = sign(token, secret);
  if (!safeEqualHex(sig, expected)) return null;
  return token;
}

export interface CreatedSession {
  id: string;
  cookieValue: string;
  expiresAt: number;
}

export async function createSession(userId: string): Promise<CreatedSession> {
  const auth = getAuthConfigRuntime();
  if (!auth.sessionSecret) {
    throw new Error('auth.sessionSecret is not set — cannot mint a session');
  }
  const id = randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  getDb()
    .prepare(
      `INSERT INTO sessions (id, user_id, created_at, last_seen_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(id, userId, now, now, expiresAt);
  return { id, cookieValue: encodeCookie(id, auth.sessionSecret), expiresAt };
}

export function destroySession(id: string): void {
  getDb().prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

export function destroyAllSessionsForUser(userId: string): void {
  getDb().prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

function loadSession(id: string): SessionRow | null {
  const row = getDb()
    .prepare('SELECT * FROM sessions WHERE id = ?')
    .get(id) as SessionRow | undefined;
  return row ?? null;
}

function touchSession(id: string, ts: number): void {
  getDb().prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(ts, id);
}

export function pruneExpiredSessions(now = Date.now()): number {
  const r = getDb().prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  return r.changes;
}

// Build the Set-Cookie header value. `secure` flips on whenever the
// request came in over HTTPS — we read req.protocol so reverse-proxied
// installs work too.
export function buildSessionCookieHeader(
  cookieValue: string,
  expiresAt: number,
  isHttps: boolean,
): string {
  return serializeCookie(SESSION_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps,
    path: '/',
    expires: new Date(expiresAt),
  });
}

export function buildClearedSessionCookieHeader(isHttps: boolean): string {
  return serializeCookie(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps,
    path: '/',
    expires: new Date(0),
  });
}

function readCookies(req: FastifyRequest): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  try {
    return parseCookie(header) as Record<string, string>;
  } catch {
    return {};
  }
}

// Look up the Authorization: Bearer <token> header (if any), look up the
// matching api_tokens row, and return the owner. Returns null when the
// header is absent, malformed, or unknown. Kept here so the same middleware
// can short-circuit on session OR token.
async function resolveBearerToken(req: FastifyRequest): Promise<User | null> {
  const auth = req.headers.authorization;
  if (!auth || typeof auth !== 'string') return null;
  const m = auth.match(/^Bearer\s+([A-Za-z0-9._-]+)$/);
  if (!m) return null;
  const presented = m[1]!;
  // The first 8 chars are stored alongside the bcrypt hash so we don't
  // have to walk every row in the table on every request. With a typical
  // token count this is effectively a unique index lookup.
  const prefix = presented.slice(0, 8);
  const rows = getDb()
    .prepare('SELECT id, user_id, token_hash FROM api_tokens WHERE token_prefix = ?')
    .all(prefix) as Array<{ id: string; user_id: string; token_hash: string }>;
  for (const row of rows) {
    try {
      const ok = await bcrypt.compare(presented, row.token_hash);
      if (ok) {
        const user = getUser(row.user_id);
        if (user) {
          getDb().prepare('UPDATE api_tokens SET last_used_at = ? WHERE id = ?')
            .run(Date.now(), row.id);
          return user;
        }
      }
    } catch {
      // ignore — continue with the next candidate.
    }
  }
  return null;
}

// Routes that are always public, regardless of auth.enabled. The login
// endpoint itself must work without a session, and the health/SSE/static
// endpoints used by the dashboard shell need to load before login.
const PUBLIC_PATH_PREFIXES = [
  '/api/health',
  '/api/auth/login',
  '/api/auth/me',
  '/events',
];

function isPublicPath(url: string): boolean {
  // Strip query string before prefix-match.
  const path = url.split('?')[0] ?? url;
  return PUBLIC_PATH_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

// Wire the middleware. We attach an `onRequest` hook that:
//   1. Resolves a User via either the session cookie or a Bearer token.
//   2. Stashes it on req.user / req.sessionId for downstream handlers.
//   3. When auth.enabled === true, rejects unauthenticated requests to
//      anything outside PUBLIC_PATH_PREFIXES.
export async function registerSessionMiddleware(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (req, reply) => {
    req.user = null;
    req.sessionId = null;
    req.authViaApiToken = false;

    const auth = getAuthConfigRuntime();

    // ── 1. API token short-circuit (works regardless of auth.enabled).
    const tokenUser = await resolveBearerToken(req);
    if (tokenUser) {
      req.user = tokenUser;
      req.authViaApiToken = true;
      return;
    }

    // ── 2. Session cookie.
    const cookies = readCookies(req);
    const cookieValue = cookies[SESSION_COOKIE_NAME];
    if (cookieValue && auth.sessionSecret) {
      const sessionId = decodeCookie(cookieValue, auth.sessionSecret);
      if (sessionId) {
        const row = loadSession(sessionId);
        const now = Date.now();
        if (row && row.expires_at > now) {
          const user = getUser(row.user_id);
          if (user) {
            req.user = user;
            req.sessionId = sessionId;
            // Extend the "last seen" timestamp — keeps the
            // /api/users page accurate without bumping the cookie's
            // hard expiry. Cheap update; one row per request worst case.
            touchSession(sessionId, now);
          }
        } else if (row) {
          // Clean up expired rows opportunistically.
          destroySession(sessionId);
        }
      }
    }

    // ── 3. Enforcement.
    if (auth.enabled && !req.user) {
      // Only the API surface is protected. The static app shell — index.html,
      // /assets/*, the favicon, and every client-side route (/projects,
      // /login, …) — must load unauthenticated so the user can reach the
      // login page; the SPA then calls /api/auth/me, gets 401, and renders
      // login. All sensitive routes live under /api (SSE /events is already
      // public via the allowlist), so gating on the /api prefix is sufficient.
      const path = req.url.split('?')[0] ?? req.url;
      const isApi = path === '/api' || path.startsWith('/api/');
      if (isApi && !isPublicPath(req.url)) {
        return reply
          .code(401)
          .send({ error: 'authentication required', authEnabled: true });
      }
    }
  });
}
