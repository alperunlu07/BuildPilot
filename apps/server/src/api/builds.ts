import type { FastifyInstance } from 'fastify';
import { createReadStream, statSync } from 'node:fs';
import { basename } from 'node:path';
import { z } from 'zod';
import { createBuild, getBuild, listBuilds, updateBuildStatus } from '../store/builds';
import { listBuildLogEntries } from '../store/buildLogs';
import { getBuildArtifact, listBuildArtifacts } from '../store/buildArtifacts';
import { getPipeline } from '../store/pipelines';
import { getProject } from '../store/projects';
import { getCurrentBranch, getHeadSha } from '../git/operations';
import { cancelBuild, enqueueBuild } from '../runner/coordinator';
import { eventBus } from '../events/bus';
import { logger } from '../logger';

const triggerSchema = z.object({
  pipelineId: z.string().min(1),
  // Optional: only run this node and its descendants (BFS over outgoing edges).
  // Lets you "Retry from failed step" without re-running earlier steps.
  fromNodeId: z.string().min(1).optional(),
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

  app.get('/api/builds/:id/entries', async (req, reply) => {
    const { id } = req.params as { id: string };
    const build = getBuild(id);
    if (!build) return reply.code(404).send({ error: 'not found' });
    const q = (req.query as { sinceSeq?: string; limit?: string }) ?? {};
    return listBuildLogEntries(id, {
      sinceSeq: q.sinceSeq ? Number(q.sinceSeq) : undefined,
      limit: q.limit ? Number(q.limit) : undefined,
    });
  });

  app.get('/api/builds/:id/artifacts', async (req, reply) => {
    const { id } = req.params as { id: string };
    const build = getBuild(id);
    if (!build) return reply.code(404).send({ error: 'not found' });
    return listBuildArtifacts(id);
  });

  app.get('/api/artifacts/:id/download', async (req, reply) => {
    const { id } = req.params as { id: string };
    const artifact = getBuildArtifact(Number(id));
    if (!artifact) return reply.code(404).send({ error: 'not found' });
    const stat = (() => {
      try { return statSync(artifact.path); } catch { return null; }
    })();
    if (!stat || !stat.isFile()) {
      return reply.code(410).send({ error: 'artifact file no longer exists at recorded path' });
    }
    reply.header('content-type', 'application/octet-stream');
    reply.header('content-length', String(stat.size));
    reply.header(
      'content-disposition',
      `attachment; filename="${basename(artifact.path).replace(/"/g, '')}"`,
    );
    return reply.send(createReadStream(artifact.path));
  });

  app.post('/api/builds', async (req, reply) => {
    const parsed = triggerSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const pipeline = getPipeline(parsed.data.pipelineId);
    if (!pipeline) return reply.code(404).send({ error: 'pipeline not found' });
    const project = getProject(pipeline.projectId);
    if (!project) return reply.code(404).send({ error: 'project not found' });

    if (parsed.data.fromNodeId && !pipeline.nodes.some((n) => n.id === parsed.data.fromNodeId)) {
      return reply.code(400).send({ error: 'fromNodeId not in pipeline' });
    }

    const branch = await getCurrentBranch(project.path).catch(() => project.defaultBranch);
    const head = (await getHeadSha(project.path, branch)) ?? '';

    const build = createBuild({
      pipelineId: pipeline.id,
      projectId: project.id,
      triggerSha: head,
      triggerBranch: branch,
    });

    void enqueueBuild({
      pipeline,
      project,
      build,
      fromNodeId: parsed.data.fromNodeId,
    }).catch((err) => {
      logger.error({ err }, 'pipeline crashed');
    });

    return build;
  });

  app.post('/api/builds/:id/cancel', async (req, reply) => {
    const { id } = req.params as { id: string };
    const build = getBuild(id);
    if (!build) return reply.code(404).send({ error: 'not found' });
    if (build.status !== 'running' && build.status !== 'pending') {
      return reply.code(409).send({ error: `build is ${build.status}, cannot cancel` });
    }
    const { wasRunning } = cancelBuild(id);
    // For builds still queued (no active children) we have to flip the DB
    // status ourselves — the engine won't get a chance to do it.
    if (!wasRunning) {
      updateBuildStatus(id, 'cancelled');
      const fresh = getBuild(id);
      if (fresh) eventBus.publish({ type: 'buildFinished', build: fresh });
    }
    return { ok: true };
  });
}
