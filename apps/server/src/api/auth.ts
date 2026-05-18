// Cluster 11.A — login / logout / me endpoints.
//
// These are *always* mounted, even when auth.enabled is false. The /me
// endpoint then returns `{ authEnabled: false, user: null }` so the UI
// knows it can skip the login screen entirely.

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getAuthConfigRuntime } from '../config';
import { getUserByUsernameWithHash, markLoginAt, verifyPassword } from '../auth/users';
import {
  buildClearedSessionCookieHeader,
  buildSessionCookieHeader,
  createSession,
  destroySession,
} from '../auth/sessions';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

function isHttpsRequest(req: FastifyRequest): boolean {
  // Behind a reverse proxy the protocol comes in via X-Forwarded-Proto;
  // Fastify exposes it on req.protocol when trustProxy is enabled, but
  // we don't enable trust proxy by default. Fall back to the raw scheme.
  const xfp = req.headers['x-forwarded-proto'];
  if (typeof xfp === 'string' && xfp.split(',')[0]?.trim() === 'https') return true;
  return req.protocol === 'https';
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/auth/me', async (req) => {
    const auth = getAuthConfigRuntime();
    return { authEnabled: auth.enabled, user: req.user ?? null };
  });

  app.post('/api/auth/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const auth = getAuthConfigRuntime();
    if (!auth.enabled) {
      // Refusing to mint a session when auth is disabled keeps the
      // /api/auth/login surface inert in the default deployment.
      return reply.code(409).send({ error: 'auth is not enabled' });
    }
    const username = parsed.data.username.trim().toLowerCase();
    const userWithHash = getUserByUsernameWithHash(username);
    // Use a constant-time-ish path: still hit verifyPassword with a dummy
    // hash if the user doesn't exist, so request timing doesn't reveal
    // which usernames are valid. The cost is bounded by bcrypt's rounds.
    const ok = userWithHash
      ? await verifyPassword(parsed.data.password, userWithHash.passwordHash)
      : await verifyPassword(parsed.data.password, '$2b$10$invalidinvalidinvalidinvaliddummyhashdummyhashdummyhash');
    if (!userWithHash || !ok) {
      return reply.code(401).send({ error: 'invalid credentials' });
    }
    const session = await createSession(userWithHash.id);
    markLoginAt(userWithHash.id, Date.now());
    reply.header(
      'Set-Cookie',
      buildSessionCookieHeader(session.cookieValue, session.expiresAt, isHttpsRequest(req)),
    );
    // Strip the password hash before returning.
    const { passwordHash: _ignored, ...publicUser } = userWithHash;
    return { user: publicUser, expiresAt: session.expiresAt };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    if (req.sessionId) destroySession(req.sessionId);
    reply.header('Set-Cookie', buildClearedSessionCookieHeader(isHttpsRequest(req)));
    return { ok: true };
  });
}
