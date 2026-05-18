import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createLane,
  deleteLane,
  getLane,
  listLanes,
  updateLane,
} from '../store/lanes';
import { getDb } from '../store/db';

const createSchema = z.object({
  name: z.string().min(1).max(100),
  maxConcurrency: z.number().int().min(1).max(64),
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  maxConcurrency: z.number().int().min(1).max(64).optional(),
});

// better-sqlite3 throws SqliteError instances with a `code` property. We only
// care about UNIQUE collisions here, so a structural duck-type check is
// plenty — avoids importing the class just for `instanceof`.
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}

// Returns the number of pipelines currently pinned to this lane, or null if
// the pipelines.lane_id column doesn't exist yet (pre-WP2 installs). Once
// WP2 adds the column, this check kicks in automatically.
function countPipelinesUsingLane(laneId: string): number | null {
  const colExists = getDb()
    .prepare(`SELECT 1 FROM pragma_table_info('pipelines') WHERE name = 'lane_id'`)
    .get();
  if (!colExists) return null;
  const row = getDb()
    .prepare('SELECT COUNT(*) AS n FROM pipelines WHERE lane_id = ?')
    .get(laneId) as { n: number };
  return row.n;
}

export async function lanesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/lanes', async () => {
    return listLanes();
  });

  app.get('/api/lanes/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const lane = getLane(id);
    if (!lane) return reply.code(404).send({ error: 'not found' });
    return lane;
  });

  app.post('/api/lanes', async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    try {
      return createLane(parsed.data);
    } catch (err) {
      if (isUniqueViolation(err)) {
        return reply.code(409).send({ error: 'name already exists' });
      }
      throw err;
    }
  });

  app.patch('/api/lanes/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    if (!getLane(id)) return reply.code(404).send({ error: 'not found' });
    try {
      // PATCH is permissive on the 'default' lane — renaming it is allowed,
      // only DELETE is blocked. (See DELETE handler below.)
      const updated = updateLane(id, parsed.data);
      if (!updated) return reply.code(404).send({ error: 'not found' });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err)) {
        return reply.code(409).send({ error: 'name already exists' });
      }
      throw err;
    }
  });

  app.delete('/api/lanes/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!getLane(id)) return reply.code(404).send({ error: 'not found' });
    if (id === 'default') {
      return reply.code(403).send({ error: 'cannot delete default lane' });
    }
    const usage = countPipelinesUsingLane(id);
    if (usage !== null && usage > 0) {
      return reply
        .code(409)
        .send({ error: 'lane in use by pipelines', pipelineCount: usage });
    }
    deleteLane(id);
    return { ok: true };
  });
}
