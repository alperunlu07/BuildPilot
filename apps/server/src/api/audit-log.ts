// Cluster 11.A — audit log viewer route.

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type {
  AuditAction,
  AuditEvent,
  AuditResource,
  AuditEventsResponse,
} from '@buildpilot/shared-types';
import { getDb } from '../store/db';
import { getAuthConfigRuntime } from '../config';

const actionSchema = z.enum(['create', 'update', 'delete', 'login', 'logout', 'other']);
const resourceSchema = z.enum([
  'project',
  'pipeline',
  'build',
  'host',
  'config',
  'user',
  'auth',
  'apiToken',
  'nodeTemplate',
  'other',
]);

interface Row {
  id: number;
  ts: number;
  actor: string;
  actor_user_id: string | null;
  action: string;
  resource: string;
  resource_id: string | null;
  method: string;
  path: string;
  status_code: number;
  request_id: string | null;
}

function rowToEvent(row: Row): AuditEvent {
  return {
    id: row.id,
    ts: row.ts,
    actor: row.actor,
    actorUserId: row.actor_user_id,
    action: row.action as AuditAction,
    resource: row.resource as AuditResource,
    resourceId: row.resource_id,
    method: row.method,
    path: row.path,
    statusCode: row.status_code,
    requestId: row.request_id,
  };
}

function canRead(req: FastifyRequest): boolean {
  const auth = getAuthConfigRuntime();
  if (!auth.enabled) return true;
  // Admins + maintainers can read; viewers cannot.
  return req.user?.role === 'admin' || req.user?.role === 'maintainer';
}

export async function auditLogRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/audit-log', async (req, reply): Promise<AuditEventsResponse | FastifyReply> => {
    if (!canRead(req)) return reply.code(403).send({ error: 'forbidden' });

    const q = req.query as {
      actor?: string;
      action?: string;
      resource?: string;
      since?: string;
      until?: string;
      limit?: string;
    };

    const filters: string[] = [];
    const params: unknown[] = [];
    if (q.actor) {
      filters.push('actor = ?');
      params.push(q.actor);
    }
    if (q.action) {
      const parsedAction = actionSchema.safeParse(q.action);
      if (parsedAction.success) {
        filters.push('action = ?');
        params.push(parsedAction.data);
      }
    }
    if (q.resource) {
      const parsedResource = resourceSchema.safeParse(q.resource);
      if (parsedResource.success) {
        filters.push('resource = ?');
        params.push(parsedResource.data);
      }
    }
    if (q.since) {
      const n = Number(q.since);
      if (Number.isFinite(n)) {
        filters.push('ts >= ?');
        params.push(n);
      }
    }
    if (q.until) {
      const n = Number(q.until);
      if (Number.isFinite(n)) {
        filters.push('ts <= ?');
        params.push(n);
      }
    }

    const limit = Math.min(Math.max(parseInt(q.limit ?? '200', 10) || 200, 1), 1000);
    // Pull one extra row to detect truncation without a second COUNT(*).
    const sql =
      `SELECT * FROM audit_log` +
      (filters.length ? ` WHERE ${filters.join(' AND ')}` : '') +
      ` ORDER BY ts DESC LIMIT ?`;
    const rows = getDb()
      .prepare(sql)
      .all(...params, limit + 1) as Row[];
    const truncated = rows.length > limit;
    const trimmed = truncated ? rows.slice(0, limit) : rows;
    return { events: trimmed.map(rowToEvent), truncated };
  });

  // Convenience: distinct actor list for the filter drop-down.
  app.get('/api/audit-log/actors', async (req, reply) => {
    if (!canRead(req)) return reply.code(403).send({ error: 'forbidden' });
    const rows = getDb()
      .prepare('SELECT DISTINCT actor FROM audit_log ORDER BY actor ASC')
      .all() as Array<{ actor: string }>;
    return rows.map((r) => r.actor);
  });
}
