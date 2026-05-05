import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createBuild, getBuild, listBuilds } from '../store/builds';
import { getPipeline } from '../store/pipelines';
import { getProject } from '../store/projects';
import { getCurrentBranch, getHeadSha } from '../git/operations';
import { runPipeline } from '../runner/engine';
import { logger } from '../logger';

const triggerSchema = z.object({
  pipelineId: z.string().min(1),
});

export async function buildsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/builds', async (req) => {
    const q = (req.query as { projectId?: string; pipelineId?: string; limit?: string }) ?? {};
    return listBuilds({
      projectId: q.projectId,
      pipelineId: q.pipelineId,
      limit: q.limit ? Number(q.limit) : undefined,
    });
  });

  app.get('/api/builds/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const build = getBuild(id);
    if (!build) return reply.code(404).send({ error: 'not found' });
    return build;
  });

  app.post('/api/builds', async (req, reply) => {
    const parsed = triggerSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const pipeline = getPipeline(parsed.data.pipelineId);
    if (!pipeline) return reply.code(404).send({ error: 'pipeline not found' });
    const project = getProject(pipeline.projectId);
    if (!project) return reply.code(404).send({ error: 'project not found' });

    const branch = await getCurrentBranch(project.path).catch(() => project.defaultBranch);
    const head = (await getHeadSha(project.path, branch)) ?? '';

    const build = createBuild({
      pipelineId: pipeline.id,
      projectId: project.id,
      triggerSha: head,
      triggerBranch: branch,
    });

    void runPipeline({ pipeline, project, build }).catch((err) => {
      logger.error({ err }, 'pipeline crashed');
    });

    return build;
  });
}
