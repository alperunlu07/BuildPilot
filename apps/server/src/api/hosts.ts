import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createHost,
  deleteHost,
  getHost,
  listHosts,
  updateHost,
} from '../store/hosts';
import { listPipelines } from '../store/pipelines';
import { listBuilds } from '../store/builds';
import { pingHost } from '../runner/hostPing';
import { eventBus } from '../events/bus';

const createSchema = z.object({
  name: z.string().min(1),
  host: z.string().min(1),
  identityFile: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
  skipStrictHostKey: z.boolean().optional(),
  description: z.string().nullable().optional(),
});

const updateSchema = createSchema.partial();

export async function hostsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/hosts', async () => listHosts());

  app.get('/api/hosts/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const h = getHost(id);
    if (!h) return reply.code(404).send({ error: 'not found' });
    return h;
  });

  app.post('/api/hosts', async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const created = createHost(parsed.data);
    eventBus.publish({ type: 'hostChanged', hostId: created.id, action: 'created' });
    return created;
  });

  app.patch('/api/hosts/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const updated = updateHost(id, parsed.data);
    if (!updated) return reply.code(404).send({ error: 'not found' });
    eventBus.publish({ type: 'hostChanged', hostId: id, action: 'updated' });
    return updated;
  });

  app.delete('/api/hosts/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!getHost(id)) return reply.code(404).send({ error: 'not found' });
    deleteHost(id);
    eventBus.publish({ type: 'hostChanged', hostId: id, action: 'deleted' });
    return { ok: true };
  });

  app.post('/api/hosts/:id/ping', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!getHost(id)) return reply.code(404).send({ error: 'not found' });
    // 200 with ok:false on probe failure (rather than 502) — the dashboard
    // wants to render the error inline, not raise a network error toast.
    try {
      const capabilities = await pingHost(id);
      eventBus.publish({ type: 'hostChanged', hostId: id, action: 'updated' });
      return { ok: true, capabilities };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Cluster 11.H — "which builds used this host?". We don't have a
  // build_nodes table tracking host assignment per step, so the best
  // approximation is: find every pipeline whose nodes_json currently
  // references this hostId, then list their recent builds. This is
  // pipeline-current-state best-effort — a pipeline that referenced this
  // host at build time but was edited since will not be reported.
  // TODO(engine): when 4.D dispatcher lands, capture (build, hostId, nodeId)
  // rows so we can serve a precise "host used at run time" history.
  app.get('/api/hosts/:id/builds', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!getHost(id)) return reply.code(404).send({ error: 'not found' });
    const q = (req.query as { limit?: string }) ?? {};
    const limit = Math.min(Math.max(parseInt(q.limit ?? '50', 10) || 50, 1), 200);
    const pipelinesUsingHost = listPipelines().filter((p) =>
      p.nodes.some((n) => (n.data as Record<string, unknown> | undefined)?.hostId === id),
    );
    if (pipelinesUsingHost.length === 0) return [];
    // Pull each pipeline's recent builds and merge newest-first.
    const merged = pipelinesUsingHost
      .flatMap((p) => listBuilds({ pipelineId: p.id, limit }))
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit);
    return merged.map((b) => ({
      id: b.id,
      pipelineId: b.pipelineId,
      projectId: b.projectId,
      status: b.status,
      startedAt: b.startedAt,
      finishedAt: b.finishedAt,
    }));
  });

  // Cluster 11.H — host load chart: bucket the same "builds that used
  // this host" set into N hourly buckets ending at `now`, counting builds
  // whose [startedAt, finishedAt] overlaps each bucket. Empty array when
  // there's no data, so the chart can render its "no data yet" placeholder.
  app.get('/api/hosts/:id/load', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!getHost(id)) return reply.code(404).send({ error: 'not found' });
    const q = (req.query as { hours?: string }) ?? {};
    const hours = Math.min(Math.max(parseInt(q.hours ?? '24', 10) || 24, 1), 168);
    const now = Date.now();
    const bucketMs = 60 * 60 * 1000; // 1h
    const startedAfter = now - hours * bucketMs;
    const pipelinesUsingHost = listPipelines().filter((p) =>
      p.nodes.some((n) => (n.data as Record<string, unknown> | undefined)?.hostId === id),
    );
    // Sample at most a recent-window slice from each pipeline. The 200-cap
    // matches listBuilds' default safety ceiling.
    const recent = pipelinesUsingHost
      .flatMap((p) => listBuilds({ pipelineId: p.id, limit: 200 }))
      .filter((b) => (b.finishedAt ?? b.startedAt) >= startedAfter);
    const buckets: Array<{ t: number; concurrent: number }> = [];
    for (let i = hours - 1; i >= 0; i--) {
      const tEnd = now - i * bucketMs;
      const tStart = tEnd - bucketMs;
      // A build is "concurrent in bucket b" if [startedAt, finishedAt||now] overlaps [tStart, tEnd).
      const concurrent = recent.filter((b) => {
        const bStart = b.startedAt;
        const bEnd = b.finishedAt ?? now;
        return bStart < tEnd && bEnd >= tStart;
      }).length;
      buckets.push({ t: tEnd, concurrent });
    }
    return buckets;
  });
}
