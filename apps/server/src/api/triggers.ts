import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { getPipeline } from '../store/pipelines';
import { getProject } from '../store/projects';
import { startBuildForPipeline } from '../runner/coordinator';

// Phase 4 Cluster A — generic API trigger + VCS webhooks.
//
// Two surfaces:
//   1. POST /api/triggers/:pipelineId { triggerSha?, triggerBranch? }
//      Anonymous-by-default. Useful for parameterised manual / external-system
//      entry points (CRON, scripts, downstream pipelines). When a project
//      sets a per-pipeline token, the request must include `?token=<value>`.
//
//   2. POST /api/webhooks/github/:pipelineId
//      GitHub push / pull_request webhook. Optional HMAC-SHA256 signature
//      verification when `?secret=...` is set on the URL OR
//      `X-Hub-Signature-256` matches the configured secret. We extract the
//      branch + sha from the payload and fire a build.
//
//   3. POST /api/webhooks/gitlab/:pipelineId
//      GitLab Push / Merge Request webhook. Token check via
//      `X-Gitlab-Token` header.
//
//   4. POST /api/webhooks/gitea/:pipelineId
//      Gitea webhook (same payload shape as GitHub). HMAC SHA256 in
//      `X-Gitea-Signature`.
//
// Webhooks bypass the poller for repos that can push, but the poller stays
// as a fallback (in case a webhook is dropped).

interface TriggerOpts {
  triggerSha?: string;
  triggerBranch?: string;
  // Free-form key=value variables echoed back in the build's log header.
  // Useful for parameterised builds; downstream step-input interpolation
  // (Phase 4 Cluster C) will read these.
  variables?: Record<string, string>;
}

async function fireTriggeredBuild(pipelineId: string, opts: TriggerOpts) {
  const pipeline = getPipeline(pipelineId);
  if (!pipeline) return { ok: false as const, status: 404, error: 'pipeline not found' };
  const project = getProject(pipeline.projectId);
  if (!project) return { ok: false as const, status: 404, error: 'project not found' };

  // Funnel through startBuildForPipeline so webhooks / external triggers
  // pick up WP4 coalesce — repeated webhook deliveries for the same pipeline
  // collapse onto the freshest pending build instead of fanning out.
  const build = await startBuildForPipeline(pipeline.id, {
    triggerSha: opts.triggerSha,
    triggerBranch: opts.triggerBranch,
  });
  if (!build) return { ok: false as const, status: 500, error: 'could not start build' };
  return { ok: true as const, build };
}

function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

function verifyHmacSha256(
  secret: string | undefined,
  body: string,
  header: string | undefined,
  expectedPrefix = 'sha256=',
): { ok: boolean; reason?: string } {
  if (!secret || secret.length === 0) return { ok: true };
  if (!header) return { ok: false, reason: 'missing signature header' };
  const sig = header.startsWith(expectedPrefix) ? header.slice(expectedPrefix.length) : header;
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  return { ok: safeEq(sig, expected), reason: 'signature mismatch' };
}

function pipelineSecret(pipelineId: string): string | undefined {
  // Per-pipeline secrets aren't a first-class field yet (the schema would
  // need a `triggerToken` column). For now, allow operators to set
  // `BUILDPILOT_WEBHOOK_SECRET_<pipelineId>` in the env as a stop-gap.
  // Hyphens in pipeline ids become double-underscores in the env name.
  const key = `BUILDPILOT_WEBHOOK_SECRET_${pipelineId.replace(/-/g, '__')}`;
  return process.env[key];
}

interface GitHubPushPayload {
  ref?: string;
  head_commit?: { id?: string };
  repository?: { default_branch?: string };
}
interface GitHubPullRequestPayload {
  pull_request?: {
    head?: { ref?: string; sha?: string };
    base?: { ref?: string };
  };
  action?: string;
}

function extractGithubTrigger(event: string, payload: unknown): TriggerOpts | null {
  if (event === 'push') {
    const p = payload as GitHubPushPayload;
    const branch = p.ref ? p.ref.replace(/^refs\/heads\//, '') : undefined;
    return { triggerBranch: branch, triggerSha: p.head_commit?.id };
  }
  if (event === 'pull_request') {
    const p = payload as GitHubPullRequestPayload;
    if (p.action !== 'opened' && p.action !== 'synchronize' && p.action !== 'reopened') {
      return null;
    }
    return { triggerBranch: p.pull_request?.head?.ref, triggerSha: p.pull_request?.head?.sha };
  }
  return null;
}

interface GitlabPushPayload {
  ref?: string;
  checkout_sha?: string;
  object_kind?: string;
}

function extractGitlabTrigger(payload: unknown): TriggerOpts | null {
  const p = payload as GitlabPushPayload & { event_name?: string };
  const kind = p.object_kind ?? p.event_name;
  if (kind !== 'push' && kind !== 'tag_push' && kind !== 'merge_request') return null;
  const branch = p.ref ? p.ref.replace(/^refs\/heads\//, '').replace(/^refs\/tags\//, '') : undefined;
  return { triggerBranch: branch, triggerSha: p.checkout_sha };
}

export async function triggerRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/triggers/:pipelineId', async (req, reply) => {
    const { pipelineId } = req.params as { pipelineId: string };
    const q = (req.query as { token?: string }) ?? {};
    const requiredToken = pipelineSecret(pipelineId);
    if (requiredToken && (!q.token || !safeEq(q.token, requiredToken))) {
      return reply.code(401).send({ error: 'invalid or missing token' });
    }
    const body = (req.body ?? {}) as TriggerOpts;
    const result = await fireTriggeredBuild(pipelineId, body);
    if (!result.ok) return reply.code(result.status).send({ error: result.error });
    return result.build;
  });

  app.post('/api/webhooks/github/:pipelineId', async (req, reply) => {
    const { pipelineId } = req.params as { pipelineId: string };
    const event = (req.headers['x-github-event'] as string | undefined) ?? '';
    const sig = req.headers['x-hub-signature-256'] as string | undefined;
    const secret = pipelineSecret(pipelineId);
    const rawBody = JSON.stringify(req.body ?? {}); // fastify already parsed
    const v = verifyHmacSha256(secret, rawBody, sig, 'sha256=');
    if (!v.ok) return reply.code(401).send({ error: v.reason });
    if (event === 'ping') return { ok: true, pong: true };
    const opts = extractGithubTrigger(event, req.body);
    if (!opts) return { ok: true, ignored: event };
    const result = await fireTriggeredBuild(pipelineId, opts);
    if (!result.ok) return reply.code(result.status).send({ error: result.error });
    return { ok: true, buildId: result.build.id };
  });

  app.post('/api/webhooks/gitea/:pipelineId', async (req, reply) => {
    const { pipelineId } = req.params as { pipelineId: string };
    const event = (req.headers['x-gitea-event'] as string | undefined) ?? '';
    const sig = req.headers['x-gitea-signature'] as string | undefined;
    const secret = pipelineSecret(pipelineId);
    const rawBody = JSON.stringify(req.body ?? {});
    const v = verifyHmacSha256(secret, rawBody, sig, '');
    if (!v.ok) return reply.code(401).send({ error: v.reason });
    if (event === 'ping') return { ok: true, pong: true };
    const opts = extractGithubTrigger(event, req.body); // same payload shape
    if (!opts) return { ok: true, ignored: event };
    const result = await fireTriggeredBuild(pipelineId, opts);
    if (!result.ok) return reply.code(result.status).send({ error: result.error });
    return { ok: true, buildId: result.build.id };
  });

  app.post('/api/webhooks/gitlab/:pipelineId', async (req, reply) => {
    const { pipelineId } = req.params as { pipelineId: string };
    const tokenHeader = req.headers['x-gitlab-token'] as string | undefined;
    const secret = pipelineSecret(pipelineId);
    if (secret && (!tokenHeader || !safeEq(tokenHeader, secret))) {
      return reply.code(401).send({ error: 'invalid or missing X-Gitlab-Token' });
    }
    const opts = extractGitlabTrigger(req.body);
    if (!opts) return { ok: true, ignored: 'unhandled object_kind' };
    const result = await fireTriggeredBuild(pipelineId, opts);
    if (!result.ok) return reply.code(result.status).send({ error: result.error });
    return { ok: true, buildId: result.build.id };
  });
}

// Exported for unit tests.
export const __test__ = { extractGithubTrigger, extractGitlabTrigger, verifyHmacSha256 };
