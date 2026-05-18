import type { FastifyInstance } from 'fastify';
import { createReadStream, statSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { basename } from 'node:path';
import { z } from 'zod';
import { createBuild, getBuild, listBuilds, listChildBuilds, updateBuildStatus } from '../store/builds';
import { listBuildLogEntries } from '../store/buildLogs';
import { getBuildArtifact, listBuildArtifacts } from '../store/buildArtifacts';
import { getPipeline } from '../store/pipelines';
import { getProject } from '../store/projects';
import { getCurrentBranch, getHeadSha } from '../git/operations';
import { cancelBuild, enqueueBuild, rerunFailedMatrixChildren } from '../runner/coordinator';
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

  // Cluster 11.C — fetch the child builds for a matrix parent. Used by
  // the dashboard's MatrixRunSummary grid. Returns [] for non-matrix
  // builds (no rows have parent_build_id = this id). Children come back
  // in insertion order so the grid layout is stable.
  app.get('/api/builds/:id/children', async (req, reply) => {
    const { id } = req.params as { id: string };
    const build = getBuild(id);
    if (!build) return reply.code(404).send({ error: 'not found' });
    return listChildBuilds(id);
  });

  // Cluster 11.C — rerun-failed cells. Spawns new child builds for every
  // cell of the parent that landed in failed or cancelled, attaching
  // them to the same parent so the grid view stitches old + new passes
  // together.
  app.post('/api/builds/:parentId/rerun-failed', async (req, reply) => {
    const { parentId } = req.params as { parentId: string };
    const parent = getBuild(parentId);
    if (!parent) return reply.code(404).send({ error: 'not found' });
    const replacements = await rerunFailedMatrixChildren(parentId);
    return { ok: true, rerun: replacements.length, children: replacements };
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

  // Inline text preview of an artifact for the dashboard log viewer.
  // Returns up to maxBytes (default 5 MiB) of UTF-8 decoded content plus a
  // `truncated` flag so the UI can show a "showing first N bytes" banner.
  // Binary files are still served — UTF-8 decode replaces invalid bytes
  // with U+FFFD rather than failing, so the modal stays usable for any
  // file the user clicked "preview" on.
  app.get('/api/artifacts/:id/text', async (req, reply) => {
    const { id } = req.params as { id: string };
    const q = (req.query as { maxBytes?: string }) ?? {};
    const MAX_LIMIT = 32 * 1024 * 1024; // 32 MiB ceiling — keep modal responsive
    const DEFAULT_LIMIT = 5 * 1024 * 1024; // 5 MiB default
    const requested = q.maxBytes ? Math.max(1, parseInt(q.maxBytes, 10) || 0) : DEFAULT_LIMIT;
    const maxBytes = Math.min(requested, MAX_LIMIT);

    const artifact = getBuildArtifact(Number(id));
    if (!artifact) return reply.code(404).send({ error: 'not found' });
    const stat = (() => {
      try { return statSync(artifact.path); } catch { return null; }
    })();
    if (!stat || !stat.isFile()) {
      return reply.code(410).send({ error: 'artifact file no longer exists at recorded path' });
    }

    const bytesToRead = Math.min(stat.size, maxBytes);
    const buf = Buffer.alloc(bytesToRead);
    const fh = await open(artifact.path, 'r');
    try {
      await fh.read(buf, 0, bytesToRead, 0);
    } finally {
      await fh.close();
    }

    return {
      id: artifact.id,
      path: artifact.path,
      size: stat.size,
      truncated: bytesToRead < stat.size,
      bytesRead: bytesToRead,
      content: buf.toString('utf-8'),
    };
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
