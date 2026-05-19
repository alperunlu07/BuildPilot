import type { FastifyInstance } from 'fastify';
import type { PrContext, PrSummary } from '@buildpilot/shared-types';
import { getBuild } from '../store/builds';
import { getProject } from '../store/projects';
import { fetchPrContextForBuild } from '../vcs';

// Cluster 11.E — surface PR metadata for a build's sha so the
// BuildDetailPage can render a "linked PR" card.
//
// Endpoint: GET /api/builds/:id/pr-context
//
// Returns null-shaped { pr: null } when:
//   - the build doesn't exist (404)
//   - the project has no VCS link (200 with empty list)
//   - the provider returned no PRs (200 with empty list)

const ISSUE_REF_RE = /(?:^|\s)#(\d{1,6})(?!\d)/g;

function parseLinkedIssues(body: string): number[] {
  const seen = new Set<number>();
  let m: RegExpExecArray | null;
  ISSUE_REF_RE.lastIndex = 0;
  while ((m = ISSUE_REF_RE.exec(body)) !== null && seen.size < 20) {
    const n = parseInt(m[1]!, 10);
    if (Number.isFinite(n) && n > 0) seen.add(n);
  }
  return [...seen];
}

export async function prContextRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/builds/:id/pr-context', async (req, reply) => {
    const { id } = req.params as { id: string };
    const build = getBuild(id);
    if (!build) return reply.code(404).send({ error: 'build not found' });
    const project = getProject(build.projectId);
    if (!project) return reply.code(404).send({ error: 'project not found' });
    if (!build.triggerSha) return { sha: '', provider: null, repo: null, prs: [] };
    try {
      const result = await fetchPrContextForBuild(project, build.triggerSha);
      if (!result) return { sha: build.triggerSha, provider: null, repo: null, prs: [] };
      const prs: PrSummary[] = result.result.prs.map((pr) => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        url: pr.url,
        authorLogin: pr.authorLogin,
        headBranch: pr.headBranch,
        baseBranch: pr.baseBranch,
        labels: pr.labels,
        linkedIssues: parseLinkedIssues(pr.body),
      }));
      const ctx: PrContext = {
        sha: build.triggerSha,
        provider: result.provider,
        repo: result.repo,
        prs,
      };
      return ctx;
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}

// Exported for unit tests.
export const __test__ = { parseLinkedIssues };
