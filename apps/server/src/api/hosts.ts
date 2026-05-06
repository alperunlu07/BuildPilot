import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createHost,
  deleteHost,
  getHost,
  listHosts,
  updateHost,
} from '../store/hosts';
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
}
