import type { FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import { basename, isAbsolute } from 'node:path';
import { z } from 'zod';
import type { ProjectSummary } from '@buildpilot/shared-types';
import {
  createProject,
  deleteProject,
  getProject,
  getProjectByPath,
  listProjects,
} from '../store/projects';
import { listBuilds } from '../store/builds';
import {
  changedPathsInCommit,
  detectDefaultBranch,
  fetchAll,
  getCurrentBranch,
  getHeadSha,
  listBranches,
  listCommits,
  listTagsWithSha,
  pull,
} from '../git/operations';
import { eventBus } from '../events/bus';

const createSchema = z.object({
  path: z.string().min(1),
  name: z.string().optional(),
});

const commitsQuery = z.object({
  branch: z.string().optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
  sinceSha: z.string().optional(),
  all: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .transform((v) => v === true || v === 'true')
    .optional(),
});

export async function projectsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/projects', async () => {
    const projects = listProjects();
    const summaries: ProjectSummary[] = await Promise.all(
      projects.map(async (p) => {
        const branches = await listBranches(p.path).catch(() => []);
        const builds = listBuilds({ projectId: p.id, limit: 1 });
        const last = builds[0];
        return {
          ...p,
          watchedBranches: branches,
          lastBuildSha: last?.triggerSha ?? null,
          lastBuildAt: last?.startedAt ?? null,
        };
      }),
    );
    return summaries;
  });

  app.get('/api/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = getProject(id);
    if (!project) return reply.code(404).send({ error: 'not found' });
    return project;
  });

  app.post('/api/projects', async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { path, name } = parsed.data;
    if (!isAbsolute(path)) return reply.code(400).send({ error: 'path must be absolute' });
    if (!existsSync(path)) return reply.code(400).send({ error: 'path does not exist' });
    if (getProjectByPath(path)) {
      return reply.code(409).send({ error: 'project already registered' });
    }
    const defaultBranch = await detectDefaultBranch(path).catch(() => 'main');
    const project = createProject({
      name: name ?? basename(path),
      path,
      defaultBranch,
    });
    eventBus.publish({ type: 'projectAdded', project });
    return project;
  });

  app.delete('/api/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!getProject(id)) return reply.code(404).send({ error: 'not found' });
    deleteProject(id);
    eventBus.publish({ type: 'projectRemoved', projectId: id });
    return { ok: true };
  });

  app.get('/api/projects/:id/branches', async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = getProject(id);
    if (!project) return reply.code(404).send({ error: 'not found' });
    return await listBranches(project.path);
  });

  app.get('/api/projects/:id/commits', async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = getProject(id);
    if (!project) return reply.code(404).send({ error: 'not found' });
    const q = commitsQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: q.error.flatten() });
    const branch = q.data.branch ?? project.defaultBranch;
    const limit = q.data.limit ?? 50;
    return await listCommits(project.path, branch, limit, q.data.sinceSha, q.data.all);
  });

  app.post('/api/projects/:id/fetch', async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = getProject(id);
    if (!project) return reply.code(404).send({ error: 'not found' });
    await fetchAll(project.path);
    return { ok: true };
  });

  app.post('/api/projects/:id/pull', async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = getProject(id);
    if (!project) return reply.code(404).send({ error: 'not found' });
    const result = await pull(project.path);
    const branch = await getCurrentBranch(project.path);
    return { ok: true, branch, result };
  });

  app.get('/api/projects/:id/current-branch', async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = getProject(id);
    if (!project) return reply.code(404).send({ error: 'not found' });
    const branch = await getCurrentBranch(project.path);
    const sha = branch ? await getHeadSha(project.path, branch) : null;
    return { branch, sha };
  });

  // Cluster 11.G — tag list for the tag-pattern preview UI. Returns each
  // tag with the commit SHA it resolves to, sorted newest-first by SHA's
  // commit date isn't available cheaply here, so we just sort
  // lexicographically reversed which puts semver-ish tags in the right
  // order most of the time. Limit is bounded so a project with thousands
  // of release tags doesn't ship them all to the dashboard.
  app.get('/api/projects/:id/tags', async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = getProject(id);
    if (!project) return reply.code(404).send({ error: 'not found' });
    const q = (req.query as { limit?: string }) ?? {};
    const limit = Math.min(Math.max(parseInt(q.limit ?? '50', 10) || 50, 1), 500);
    const tags = await listTagsWithSha(project.path);
    const sorted = tags.slice().sort((a, b) => b.tag.localeCompare(a.tag, undefined, { numeric: true }));
    return sorted.slice(0, limit);
  });

  // Cluster 11.G — changed files for a single commit. Used by the
  // path-filter preview to render ✓/✗ rows next to each commit. Returns
  // a flat list of strings; empty for root commits or unknown SHAs.
  app.get('/api/projects/:id/commits/:sha/changed-files', async (req, reply) => {
    const { id, sha } = req.params as { id: string; sha: string };
    const project = getProject(id);
    if (!project) return reply.code(404).send({ error: 'not found' });
    if (!/^[0-9a-fA-F]{4,64}$/.test(sha)) {
      return reply.code(400).send({ error: 'invalid sha' });
    }
    const files = await changedPathsInCommit(project.path, sha);
    return { sha, files };
  });

  // Phase 4 Cluster D — per-project build sparkline. Returns the last N
  // builds across all pipelines for the project, ordered oldest → newest.
  // The dashboard renders a 30-cell colour strip from this; the limit cap
  // is the same 200 the regular /api/builds endpoint uses.
  app.get('/api/projects/:id/sparkline', async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = getProject(id);
    if (!project) return reply.code(404).send({ error: 'not found' });
    const q = (req.query as { limit?: string }) ?? {};
    const limit = Math.min(Math.max(parseInt(q.limit ?? '30', 10) || 30, 1), 200);
    const recent = listBuilds({ projectId: id, limit });
    // listBuilds returns newest-first; for sparklines we want chronological
    // order so the left edge is "oldest visible".
    return recent
      .slice()
      .reverse()
      .map((b) => ({
        id: b.id,
        pipelineId: b.pipelineId,
        status: b.status,
        startedAt: b.startedAt,
        finishedAt: b.finishedAt,
      }));
  });
}
