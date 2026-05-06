import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  clonePipeline,
  createPipeline,
  deletePipeline,
  getPipeline,
  listPipelines,
  updatePipeline,
} from '../store/pipelines';
import { getProject } from '../store/projects';
import { eventBus } from '../events/bus';

const stepTypes = [
  'checkout',
  'pull',
  'shell',
  'unityBatch',
  'httpRequest',
  'slackNotify',
  'discordNotify',
  'telegramNotify',
  'aiPrompt',
  'artifact',
  'remoteSsh',
  'sftpUpload',
  'xcodebuild',
  'gitMerge',
  's3Upload',
  'testflightUpload',
  'keychainUnlock',
  'provisioningProfileInstall',
  'notarize',
  'stapleNotarization',
  'fastlaneMatch',
  'cocoapodsInstall',
  'swiftPackageResolve',
  'dsymUpload',
  'xcresultParse',
] as const;

const nodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(stepTypes),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.string(), z.unknown()),
});

const edgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  condition: z.enum(['success', 'failure', 'always']).optional(),
});

const watchSchema = z.object({
  branch: z.string().min(1),
  intervalSec: z.number().int().positive(),
  autoTrigger: z.enum(['off', 'ask', 'pull', 'pullAndBuild']),
  telegramApprovals: z.boolean().optional(),
});

const createSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1),
  watch: watchSchema,
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  watch: watchSchema.optional(),
  nodes: z.array(nodeSchema).optional(),
  edges: z.array(edgeSchema).optional(),
});

export async function pipelinesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/pipelines', async (req) => {
    const { projectId } = (req.query as { projectId?: string }) ?? {};
    return listPipelines(projectId);
  });

  app.get('/api/pipelines/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = getPipeline(id);
    if (!p) return reply.code(404).send({ error: 'not found' });
    return p;
  });

  app.post('/api/pipelines', async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    if (!getProject(parsed.data.projectId)) {
      return reply.code(400).send({ error: 'project not found' });
    }
    const created = createPipeline(parsed.data);
    eventBus.publish({ type: 'pipelineChanged', pipelineId: created.id, action: 'created' });
    return created;
  });

  app.patch('/api/pipelines/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const updated = updatePipeline(id, parsed.data);
    if (!updated) return reply.code(404).send({ error: 'not found' });
    eventBus.publish({ type: 'pipelineChanged', pipelineId: id, action: 'updated' });
    return updated;
  });

  app.delete('/api/pipelines/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!getPipeline(id)) return reply.code(404).send({ error: 'not found' });
    deletePipeline(id);
    eventBus.publish({ type: 'pipelineChanged', pipelineId: id, action: 'deleted' });
    return { ok: true };
  });

  app.post('/api/pipelines/:id/clone', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { name?: string };
    const cloned = clonePipeline(id, body.name);
    if (!cloned) return reply.code(404).send({ error: 'not found' });
    eventBus.publish({ type: 'pipelineChanged', pipelineId: cloned.id, action: 'created' });
    return cloned;
  });
}
