// Cluster 11.A — user-management routes.
//
// Authorisation rules (only enforced when `auth.enabled === true`):
//   - Anyone (including anonymous) can hit POST /api/users when the table
//     is empty, to bootstrap the first admin.
//   - When at least one user exists and auth is on, only an `admin` can
//     create / delete / change roles. A user can always update their own
//     displayName / password / notificationPrefs via PATCH /api/users/me.
//   - When `auth.enabled === false` we still expose the routes for
//     pre-flight setup but creating a user implicitly enables the table —
//     flipping `auth.enabled` to true in config.json activates enforcement.

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { UserRole } from '@buildpilot/shared-types';
import { getAuthConfigRuntime } from '../config';
import {
  countUsers,
  createUser,
  deleteUser,
  getUser,
  listUsers,
  updateUser,
} from '../auth/users';
import { destroyAllSessionsForUser } from '../auth/sessions';

const roleSchema = z.enum(['admin', 'maintainer', 'viewer']) satisfies z.ZodType<UserRole>;

const notificationPrefsSchema = z.object({
  desktop: z.boolean(),
  telegram: z.boolean(),
  slack: z.boolean(),
  discord: z.boolean(),
  email: z.boolean(),
});

const createSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(8).max(256),
  displayName: z.string().min(1).max(128).optional(),
  role: roleSchema.optional(),
});

const updateSchema = z.object({
  displayName: z.string().min(1).max(128).optional(),
  role: roleSchema.optional(),
  password: z.string().min(8).max(256).optional(),
  notificationPrefs: notificationPrefsSchema.optional(),
});

// `true` when the caller is admin (or auth is disabled, which means
// "trust everyone on the local network" exactly like the existing
// single-user install).
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

export async function usersRoutes(app: FastifyInstance): Promise<void> {
  // List — admins always; others only see themselves (single-element list).
  app.get('/api/users', async (req) => {
    if (isAdminOrUnenforced(req)) return listUsers();
    return req.user ? [req.user] : [];
  });

  // Current user — convenience for the profile dropdown. Mirrors
  // /api/auth/me but with a stable shape (always a user object or 401).
  app.get('/api/users/me', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'not authenticated' });
    return req.user;
  });

  app.get('/api/users/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!requireSelfOrAdmin(req, reply, id)) return;
    const u = getUser(id);
    if (!u) return reply.code(404).send({ error: 'not found' });
    return u;
  });

  app.post('/api/users', async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    // Bootstrap path: the table is empty, anyone can create the first
    // admin (and the createUser helper forces role=admin in that case).
    const isBootstrap = countUsers() === 0;
    if (!isBootstrap && !isAdminOrUnenforced(req)) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    try {
      const u = await createUser(parsed.data);
      return reply.code(201).send(u);
    } catch (err) {
      return reply
        .code(400)
        .send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // PATCH /api/users/me — self-update shortcut for displayName / password /
  // notificationPrefs. Cannot change role this way.
  app.patch('/api/users/me', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'not authenticated' });
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    if (parsed.data.role !== undefined && parsed.data.role !== req.user.role) {
      return reply.code(403).send({ error: 'cannot change own role' });
    }
    const { role: _ignored, ...rest } = parsed.data;
    const updated = await updateUser(req.user.id, rest);
    return updated;
  });

  app.patch('/api/users/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!requireSelfOrAdmin(req, reply, id)) return;
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    // Non-admins can never change roles, even on themselves.
    if (parsed.data.role !== undefined && !isAdminOrUnenforced(req)) {
      return reply.code(403).send({ error: 'cannot change role' });
    }
    const updated = await updateUser(id, parsed.data);
    if (!updated) return reply.code(404).send({ error: 'not found' });
    return updated;
  });

  app.delete('/api/users/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!isAdminOrUnenforced(req)) return reply.code(403).send({ error: 'forbidden' });
    if (!getUser(id)) return reply.code(404).send({ error: 'not found' });
    // Refuse to delete the last remaining admin so the install can't get
    // locked out. A single-user install that wants to "remove all users"
    // should toggle auth.enabled off in config.json instead.
    const admins = listUsers().filter((u) => u.role === 'admin');
    if (admins.length === 1 && admins[0]!.id === id) {
      return reply
        .code(409)
        .send({ error: 'cannot delete the last admin' });
    }
    deleteUser(id);
    destroyAllSessionsForUser(id);
    return { ok: true };
  });
}
