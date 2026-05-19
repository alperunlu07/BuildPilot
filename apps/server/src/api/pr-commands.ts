import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { logger } from '../logger';
import { listPipelines } from '../store/pipelines';
import { getProject } from '../store/projects';
import { createBuild } from '../store/builds';
import { enqueueBuild } from '../runner/coordinator';

// Cluster 11.E — slash-command driven build triggers.
//
// Endpoint: POST /api/webhooks/pr-comment/:projectId
//
// Designed to be wired as a single GitHub-/Gitea-style webhook on a
// repository, filtered to `issue_comment` events. The body is a standard
// GitHub `issue_comment` payload (Gitea uses the same shape; GitLab support
// pending — GitLab note events have a different schema).
//
// On every comment we:
//   1. Verify the HMAC signature if a per-project secret is configured.
//   2. Pull out the first slash-token from the comment body.
//   3. Look up every pipeline on the project; pick the one whose
//      slug-of-name matches the token AND whose `prCommands` includes
//      the same token (or the wildcard "*").
//   4. Resolve the PR's head sha via the payload (issue.pull_request.url)
//      so we don't need an extra API call.
//   5. Enqueue a build against that sha.
//
// Notes:
//   - We don't currently check that the commenter actually has write access
//     — the secret on the URL is the gate. If `prCommandAuthors` is set on
//     the pipeline, we also require the commenter to be in that list.
//   - Re-uses pipelineSecret() naming convention from triggers.ts but reads
//     from a project-scoped env var instead.

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

function projectSecret(projectId: string): string | undefined {
  // Hyphens in project ids become double-underscores in the env name.
  const key = `BUILDPILOT_PR_COMMENT_SECRET_${projectId.replace(/-/g, '__')}`;
  return process.env[key];
}

function verifyHmac(
  secret: string | undefined,
  body: string,
  header: string | undefined,
): { ok: boolean; reason?: string } {
  if (!secret) return { ok: true };
  if (!header) return { ok: false, reason: 'missing signature header' };
  const sig = header.startsWith('sha256=') ? header.slice('sha256='.length) : header;
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  return { ok: safeEq(sig, expected), reason: 'signature mismatch' };
}

interface IssueCommentPayload {
  action?: string;
  issue?: {
    number?: number;
    pull_request?: { url?: string; html_url?: string };
  };
  comment?: {
    body?: string;
    user?: { login?: string };
  };
  // GitHub gives us this — handy because we don't have to call the API for
  // the head sha. Gitea v1.20+ also provides it; older Gitea does not.
  pull_request?: {
    head?: { sha?: string; ref?: string };
    base?: { ref?: string };
  };
  repository?: {
    full_name?: string;
  };
}

// Parsed "first slash command" from a comment. Trimmed lowercase token; the
// rest of the line (potential arguments) is preserved for future use.
export interface ParsedCommand {
  command: string;
  args: string;
}

export function parseSlashCommand(body: string): ParsedCommand | null {
  // Look at non-blank lines; accept the command on any line so quoting
  // doesn't matter ("Looks good! /run-ios"). Stop at the first match so
  // a single comment fires at most one build.
  const lines = body.split(/\r?\n/);
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed.startsWith('/')) continue;
    const m = trimmed.match(/^\/([\w-]+)\s*(.*)$/);
    if (!m) continue;
    return { command: m[1]!.toLowerCase(), args: m[2]!.trim() };
  }
  return null;
}

export interface PipelineCommandMatch {
  pipelineId: string;
  pipelineName: string;
  reason: string;
}

// Exposed for tests. Picks a single pipeline for the (project, command)
// pair. A pipeline matches when EITHER:
//   - one of its allowed `prCommands` entries equals the command, OR
//   - it allows "*" (wildcard) AND its slugged name matches the command.
export function pickPipelineForCommand(
  pipelines: Array<{ id: string; name: string; watch: { prCommands?: string; prCommandAuthors?: string } }>,
  command: string,
  author: string | null,
): PipelineCommandMatch | { error: string } {
  const candidates: PipelineCommandMatch[] = [];
  for (const p of pipelines) {
    const allowed = (p.watch.prCommands ?? '')
      .split(/[,\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
    if (allowed.length === 0) continue;
    const slugged = slug(p.name);
    const matchesExplicit = allowed.includes(command);
    const matchesWildcard = allowed.includes('*') && slugged === command;
    if (!matchesExplicit && !matchesWildcard) continue;
    // Author whitelist (optional).
    const authors = (p.watch.prCommandAuthors ?? '')
      .split(/[,\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
    if (authors.length > 0) {
      if (!author || !authors.includes(author.toLowerCase())) continue;
    }
    candidates.push({
      pipelineId: p.id,
      pipelineName: p.name,
      reason: matchesExplicit ? `prCommands matches "${command}"` : `wildcard + slug matches "${command}"`,
    });
  }
  if (candidates.length === 0) return { error: 'no pipeline matched' };
  if (candidates.length > 1) {
    return { error: `${candidates.length} pipelines match — narrow prCommands to disambiguate` };
  }
  return candidates[0]!;
}

export async function prCommandRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/webhooks/pr-comment/:projectId', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const project = getProject(projectId);
    if (!project) return reply.code(404).send({ error: 'project not found' });
    const sig =
      (req.headers['x-hub-signature-256'] as string | undefined) ??
      (req.headers['x-gitea-signature'] as string | undefined);
    const secret = projectSecret(projectId);
    const rawBody = JSON.stringify(req.body ?? {});
    const v = verifyHmac(secret, rawBody, sig);
    if (!v.ok) return reply.code(401).send({ error: v.reason });

    const event =
      (req.headers['x-github-event'] as string | undefined) ??
      (req.headers['x-gitea-event'] as string | undefined) ??
      '';
    if (event === 'ping') return { ok: true, pong: true };
    if (event && event !== 'issue_comment' && event !== 'pull_request_comment') {
      return { ok: true, ignored: event };
    }

    const payload = (req.body ?? {}) as IssueCommentPayload;
    if (payload.action !== 'created' && payload.action !== 'edited') {
      return { ok: true, ignored: `action=${payload.action ?? '?'}` };
    }
    if (!payload.issue?.pull_request) {
      return { ok: true, ignored: 'not a PR comment' };
    }
    const body = payload.comment?.body ?? '';
    const parsed = parseSlashCommand(body);
    if (!parsed) return { ok: true, ignored: 'no slash command' };

    const author = payload.comment?.user?.login ?? null;
    const pipelines = listPipelines(projectId);
    const match = pickPipelineForCommand(pipelines, parsed.command, author);
    if ('error' in match) {
      return { ok: false, ignored: match.error };
    }
    const pipeline = pipelines.find((p) => p.id === match.pipelineId);
    if (!pipeline) return reply.code(500).send({ error: 'pipeline lookup race' });

    const headSha = payload.pull_request?.head?.sha ?? '';
    const headBranch = payload.pull_request?.head?.ref ?? '';
    if (!headSha) {
      // Without the head sha we can't post a meaningful check-run back.
      // Some providers don't include `pull_request` on the issue_comment
      // payload — surface the error so the user wires the webhook with
      // the correct event delivery options.
      return reply.code(422).send({
        error:
          'comment payload missing pull_request.head.sha — enable "Send full PR payload" on the webhook',
      });
    }

    const build = createBuild({
      pipelineId: pipeline.id,
      projectId: project.id,
      triggerSha: headSha,
      triggerBranch: headBranch || project.defaultBranch,
    });
    void enqueueBuild({ pipeline, project, build, fromNodeId: undefined }).catch((err) => {
      logger.error({ err, pipelineId: pipeline.id }, 'pr-command triggered pipeline crashed');
    });
    return {
      ok: true,
      buildId: build.id,
      pipelineId: pipeline.id,
      command: parsed.command,
      reason: match.reason,
    };
  });
}

// Exported for tests.
export const __test__ = { parseSlashCommand, pickPipelineForCommand, slug };
