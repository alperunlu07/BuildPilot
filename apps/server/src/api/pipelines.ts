import type { FastifyInstance } from 'fastify';
import type { StepType } from '@buildpilot/shared-types';
import { z } from 'zod';
import { STEP_TYPES } from '@buildpilot/step-registry';
import {
  clonePipeline,
  createPipeline,
  deletePipeline,
  getPipeline,
  listPipelines,
  setPipelineMatrix,
  updatePipeline,
} from '../store/pipelines';
import { getProject } from '../store/projects';
import { getLane } from '../store/lanes';
import { eventBus } from '../events/bus';

// Sourced from the step-registry so new step types automatically pass the
// API zod gate without an extra checklist line here. We hand zod a tuple
// of StepType so the parsed `type` field is properly narrowed.
const stepTypes = STEP_TYPES as readonly [StepType, ...StepType[]];

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
  tagPattern: z.string().optional(),
  cronExpr: z.string().optional(),
  pathFilter: z.string().optional(),
  cancelInProgressOnNewCommit: z.boolean().optional(),
  // Cluster 11.C — opt-in flag. Default true on the server when omitted.
  matrixSummary: z.boolean().optional(),
});

// Cluster 11.C — matrix declaration. Per-axis arrays must have ≥1 value
// (an empty axis would collapse the cross-product to zero builds). We
// coerce arbitrary values to strings on the server boundary to keep
// interpolation simple.
const matrixSchema = z
  .object({
    axes: z.record(
      z.string().min(1),
      z.array(z.string().min(1)).min(1),
    ),
  })
  .refine((m) => Object.keys(m.axes).length > 0, 'matrix.axes must have at least one axis')
  .nullable();

const createSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1),
  watch: watchSchema,
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
  matrix: matrixSchema.optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  watch: watchSchema.optional(),
  nodes: z.array(nodeSchema).optional(),
  edges: z.array(edgeSchema).optional(),
  matrix: matrixSchema.optional(),
  // WP2 (queue): repinning a pipeline to a different lane / changing its
  // queue priority. laneId existence is validated below against the lanes
  // store — store-level FK can't be added via additive ALTER TABLE.
  laneId: z.string().min(1).optional(),
  priority: z.number().int().min(0).max(10000).optional(),
});

const setMatrixSchema = z.object({
  matrix: matrixSchema,
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
    // WP2: validate lane existence before accepting the patch.
    if (parsed.data.laneId !== undefined && !getLane(parsed.data.laneId)) {
      return reply.code(400).send({ error: 'lane not found' });
    }
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

  // Cluster 11.C — dedicated matrix setter. The full PATCH route also
  // accepts a `matrix` field but this endpoint is easier to call from the
  // editor's MatrixEditor panel because it doesn't require round-tripping
  // the entire pipeline shape.
  app.post('/api/pipelines/:id/matrix', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = setMatrixSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const updated = setPipelineMatrix(id, parsed.data.matrix);
    if (!updated) return reply.code(404).send({ error: 'not found' });
    eventBus.publish({ type: 'pipelineChanged', pipelineId: id, action: 'updated' });
    return updated;
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
