import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { SecretUsage } from '@buildpilot/shared-types';
import {
  createSecret,
  deleteSecret,
  getSecret,
  listSecrets,
  rotateSecret,
} from '../store/secrets';
import { listPipelines } from '../store/pipelines';
import { collectReferences } from '../secrets/interpolation';

// Cluster 11.B — secrets vault CRUD. The plaintext value is intentionally
// never returned: it can only be set on create or rotated in-place.

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const createSchema = z.object({
  name: z.string().regex(NAME_RE),
  value: z.string().min(1),
});

const rotateSchema = z.object({
  value: z.string().min(1),
});

export async function secretsRoutes(app: FastifyInstance): Promise<void> {
  // List metadata only — never the value.
  app.get('/api/secrets', async () => listSecrets());

  app.get('/api/secrets/:name', async (req, reply) => {
    const { name } = req.params as { name: string };
    const s = getSecret(name);
    if (!s) return reply.code(404).send({ error: 'not found' });
    return s;
  });

  app.post('/api/secrets', async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    if (getSecret(parsed.data.name)) {
      return reply.code(409).send({ error: 'a secret with that name already exists' });
    }
    try {
      const created = createSecret(parsed.data.name, parsed.data.value);
      return created;
    } catch (err) {
      return reply
        .code(400)
        .send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Rotate the value while preserving the public id/name. The plaintext is
  // overwritten irreversibly.
  app.put('/api/secrets/:name', async (req, reply) => {
    const { name } = req.params as { name: string };
    const parsed = rotateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    try {
      const updated = rotateSecret(name, parsed.data.value);
      if (!updated) return reply.code(404).send({ error: 'not found' });
      return updated;
    } catch (err) {
      return reply
        .code(400)
        .send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete('/api/secrets/:name', async (req, reply) => {
    const { name } = req.params as { name: string };
    if (!deleteSecret(name)) return reply.code(404).send({ error: 'not found' });
    return { ok: true };
  });

  // "Where is this secret used?" — scan every pipeline's nodes_json for
  // the marker. Returns one row per (pipeline, node, field) reference so
  // the UI can list the exact context that depends on this secret.
  app.get('/api/secrets/:name/usages', async (req, reply) => {
    const { name } = req.params as { name: string };
    if (!getSecret(name)) return reply.code(404).send({ error: 'not found' });
    const usages: SecretUsage[] = [];
    for (const pipeline of listPipelines()) {
      for (const node of pipeline.nodes) {
        for (const [fieldName, value] of Object.entries(node.data)) {
          // Scan only string-typed leaves — covers the overwhelming
          // majority of step fields. The shared collectReferences helper
          // also walks nested objects/arrays, which we apply per-field
          // so the fieldName ends up in the result.
          const { secrets } = collectReferences(value);
          if (secrets.has(name)) {
            usages.push({
              pipelineId: pipeline.id,
              pipelineName: pipeline.name,
              nodeId: node.id,
              nodeType: node.type,
              fieldName,
            });
          }
        }
      }
    }
    return usages;
  });
}
