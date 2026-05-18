// Cluster 11.A — audit log Fastify hook.
//
// We attach an `onResponse` hook that classifies every state-mutating
// request (POST / PUT / PATCH / DELETE) into an `(action, resource)` pair
// and writes a row to the `audit_log` table. Read-only GETs are NOT
// logged — the volume would be huge and they don't represent decisions
// worth auditing.
//
// When `auth.enabled === false` we still record events, but the actor is
// `"anonymous"`. That way, audit history is captured retroactively the
// moment an operator turns auth on.

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AuditAction, AuditResource } from '@buildpilot/shared-types';
import { getDb } from './store/db';

// Map a URL path prefix to the audit "resource" bucket. Order matters —
// we pick the first matching entry. Anything not matched falls into the
// `'other'` bucket so we still record the call.
const RESOURCE_MAP: ReadonlyArray<{ prefix: string; resource: AuditResource }> = [
  { prefix: '/api/projects', resource: 'project' },
  { prefix: '/api/pipelines', resource: 'pipeline' },
  { prefix: '/api/builds', resource: 'build' },
  { prefix: '/api/hosts', resource: 'host' },
  { prefix: '/api/node-templates', resource: 'nodeTemplate' },
  { prefix: '/api/config', resource: 'config' },
  { prefix: '/api/users', resource: 'user' },
  { prefix: '/api/auth/login', resource: 'auth' },
  { prefix: '/api/auth/logout', resource: 'auth' },
  { prefix: '/api/api-tokens', resource: 'apiToken' },
];

function classifyResource(path: string): AuditResource {
  const clean = path.split('?')[0] ?? path;
  for (const entry of RESOURCE_MAP) {
    if (clean === entry.prefix || clean.startsWith(`${entry.prefix}/`)) return entry.resource;
  }
  return 'other';
}

// Extract a best-effort resource id from a URL like
// `/api/pipelines/abc-123` or `/api/users/abc/something`. Returns null
// when the path doesn't include a second path segment.
function extractResourceId(path: string, resource: AuditResource): string | null {
  const clean = (path.split('?')[0] ?? path).replace(/\/+$/, '');
  const knownPrefix = RESOURCE_MAP.find((e) => e.resource === resource)?.prefix;
  if (!knownPrefix) return null;
  if (!clean.startsWith(`${knownPrefix}/`)) return null;
  const rest = clean.slice(knownPrefix.length + 1);
  if (!rest) return null;
  return rest.split('/')[0] || null;
}

function classifyAction(method: string, path: string): AuditAction {
  if (path === '/api/auth/login') return 'login';
  if (path === '/api/auth/logout') return 'logout';
  switch (method.toUpperCase()) {
    case 'POST':
      return 'create';
    case 'PUT':
    case 'PATCH':
      return 'update';
    case 'DELETE':
      return 'delete';
    default:
      return 'other';
  }
}

// Don't log GETs (too noisy) or our own audit-log-read endpoint (would
// recurse and pollute the log with view events).
function shouldLog(req: FastifyRequest): boolean {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
  // Skip SSE + health probes regardless of method (none of them mutate).
  const path = (req.url.split('?')[0] ?? req.url);
  if (path === '/events' || path === '/api/health') return false;
  // Skip the test-notify dry-run too — it fires real webhooks but is
  // ephemeral by design and doesn't change persisted state.
  if (path === '/api/test-notify') return false;
  return true;
}

export interface AuditWriteInput {
  ts: number;
  actor: string;
  actorUserId: string | null;
  action: AuditAction;
  resource: AuditResource;
  resourceId: string | null;
  method: string;
  path: string;
  statusCode: number;
  requestId: string | null;
}

export function writeAuditEvent(input: AuditWriteInput): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO audit_log (
          ts, actor, actor_user_id, action, resource, resource_id,
          method, path, status_code, request_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.ts,
        input.actor,
        input.actorUserId,
        input.action,
        input.resource,
        input.resourceId,
        input.method,
        input.path,
        input.statusCode,
        input.requestId,
      );
  } catch {
    // Auditing must never break the response. Swallow.
  }
}

export async function registerAuditHook(app: FastifyInstance): Promise<void> {
  app.addHook('onResponse', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!shouldLog(req)) return;
    const status = reply.statusCode;
    // Skip 4xx that represent input validation errors — those aren't
    // interesting audit events. We still capture 401/403 because those
    // tell us someone tried to do something they shouldn't.
    if (status >= 400 && status < 500 && status !== 401 && status !== 403) return;
    const path = req.url.split('?')[0] ?? req.url;
    const resource = classifyResource(path);
    const action = classifyAction(req.method, path);
    const resourceId = extractResourceId(path, resource);
    const actor = req.user?.username ?? 'anonymous';
    writeAuditEvent({
      ts: Date.now(),
      actor,
      actorUserId: req.user?.id ?? null,
      action,
      resource,
      resourceId,
      method: req.method,
      path,
      statusCode: status,
      requestId: req.id ?? null,
    });
  });
}
