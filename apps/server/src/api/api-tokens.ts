// Cluster 11.A — long-lived API tokens for CI scripts.
//
// Storage model:
//   - Plaintext value is `bp_` + 32 random bytes (hex). Total 67 chars.
//   - We persist a bcrypt hash and the first 8 chars of the plaintext.
//     The 8-char prefix lets the session middleware skip the full table
//     scan on every request — it narrows the candidate set to a single
//     row in practice.
//   - The plaintext is returned exactly once, in the POST response.

import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import type {
  ApiToken,
  CreatedApiToken,
  UserRole,
} from '@buildpilot/shared-types';
import { getDb } from '../store/db';
import { getAuthConfigRuntime } from '../config';
import { getUser, listUsers } from '../auth/users';

interface TokenRow {
  id: string;
  user_id: string;
  name: string;
  token_hash: string;
  token_prefix: string;
  created_at: number;
  last_used_at: number | null;
}

function rowToApiToken(row: TokenRow): ApiToken | null {
  const owner = getUser(row.user_id);
  if (!owner) return null;
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    ownerUsername: owner.username,
    ownerRole: owner.role as UserRole,
  };
}

const createSchema = z.object({
  name: z.string().min(1).max(128),
  userId: z.string().min(1).optional(),
});

function isAdminOrUnenforced(req: FastifyRequest): boolean {
  const auth = getAuthConfigRuntime();
  if (!auth.enabled) return true;
  return req.user?.role === 'admin';
}

function requireSelfOrAdmin(req: FastifyRequest, reply: FastifyReply, targetUserId: string): boolean {
  if (isAdminOrUnenforced(req)) return true;
  if (req.user?.id === targetUserId) return true;
  reply.code(403).send({ error: 'forbidden' });
  return false;
}

export async function apiTokensRoutes(app: FastifyInstance): Promise<void> {
  // List — admins see every token, others see only their own.
  app.get('/api/api-tokens', async (req) => {
    const auth = getAuthConfigRuntime();
    const filterUserId = !isAdminOrUnenforced(req) && auth.enabled ? req.user?.id : null;
    const rows = filterUserId
      ? (getDb()
          .prepare('SELECT * FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC')
          .all(filterUserId) as TokenRow[])
      : (getDb()
          .prepare('SELECT * FROM api_tokens ORDER BY created_at DESC')
          .all() as TokenRow[]);
    return rows.map(rowToApiToken).filter((t): t is ApiToken => t !== null);
  });

  app.post('/api/api-tokens', async (req, reply): Promise<CreatedApiToken | FastifyReply> => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const auth = getAuthConfigRuntime();

    // Resolve the owner. When auth is enabled, default to the caller;
    // non-admins cannot target other users. When auth is disabled, the
    // caller MUST specify a userId because there's no logged-in user
    // to default to (and we still need a row in the users table).
    let ownerId: string | undefined;
    if (parsed.data.userId) {
      if (!requireSelfOrAdmin(req, reply, parsed.data.userId)) return reply;
      ownerId = parsed.data.userId;
    } else if (req.user) {
      ownerId = req.user.id;
    } else if (!auth.enabled) {
      // Pick the first admin as a sensible default when auth is off and
      // the caller didn't specify a userId. If there isn't one yet, the
      // operator needs to bootstrap a user first.
      const adminish = listUsers().find((u) => u.role === 'admin') ?? listUsers()[0];
      ownerId = adminish?.id;
    }
    if (!ownerId) {
      return reply
        .code(400)
        .send({ error: 'userId is required (no users exist yet)' });
    }
    if (!getUser(ownerId)) {
      return reply.code(404).send({ error: 'user not found' });
    }

    const plaintext = `bp_${randomBytes(32).toString('hex')}`;
    const hash = await bcrypt.hash(plaintext, 10);
    const id = randomUUID();
    const now = Date.now();
    getDb()
      .prepare(
        `INSERT INTO api_tokens (
          id, user_id, name, token_hash, token_prefix, created_at, last_used_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(id, ownerId, parsed.data.name, hash, plaintext.slice(0, 8), now);
    const row = getDb().prepare('SELECT * FROM api_tokens WHERE id = ?').get(id) as TokenRow;
    const meta = rowToApiToken(row);
    if (!meta) return reply.code(500).send({ error: 'failed to read back token' });
    return reply.code(201).send({ ...meta, token: plaintext });
  });

  app.delete('/api/api-tokens/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = getDb().prepare('SELECT * FROM api_tokens WHERE id = ?').get(id) as TokenRow | undefined;
    if (!row) return reply.code(404).send({ error: 'not found' });
    if (!requireSelfOrAdmin(req, reply, row.user_id)) return;
    getDb().prepare('DELETE FROM api_tokens WHERE id = ?').run(id);
    return { ok: true };
  });
}
