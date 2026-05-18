import type { FastifyInstance } from 'fastify';
import type {
  ProjectVcsUpdate,
  VcsCredentialCreate,
  VcsProvider,
} from '@buildpilot/shared-types';
import {
  createVcsCredential,
  deleteVcsCredential,
  getVcsCredentialPublic,
  listVcsCredentials,
} from '../store/vcsCredentials';
import { getProject, updateProjectVcs } from '../store/projects';
import { getGithubOAuthRuntime } from '../config';
import { logger } from '../logger';
import { randomBytes } from 'node:crypto';

// Cluster 11.E — CRUD for VCS credentials + per-project VCS link endpoint.
//
// Surfaces:
//   GET    /api/vcs/credentials          → list (no token values)
//   POST   /api/vcs/credentials          → create
//   DELETE /api/vcs/credentials/:id      → delete
//   PUT    /api/projects/:id/vcs         → link/unlink project to VCS
//   GET    /api/projects/:id/vcs         → read current link

const PROVIDERS: VcsProvider[] = ['github', 'gitlab', 'gitea'];

export async function vcsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/vcs/credentials', async () => listVcsCredentials());

  app.post('/api/vcs/credentials', async (req, reply) => {
    const body = (req.body ?? {}) as Partial<VcsCredentialCreate>;
    if (!body.name || typeof body.name !== 'string') {
      return reply.code(400).send({ error: 'name required' });
    }
    if (!body.provider || !PROVIDERS.includes(body.provider)) {
      return reply.code(400).send({ error: `provider must be one of: ${PROVIDERS.join(', ')}` });
    }
    if (!body.vcsToken || typeof body.vcsToken !== 'string') {
      return reply.code(400).send({ error: 'vcsToken required' });
    }
    if (body.provider === 'gitea' && !body.baseUrl) {
      return reply.code(400).send({ error: 'baseUrl required for gitea' });
    }
    const cred = createVcsCredential({
      name: body.name.trim(),
      provider: body.provider,
      baseUrl: body.baseUrl?.trim() || undefined,
      vcsToken: body.vcsToken,
    });
    return cred;
  });

  app.delete('/api/vcs/credentials/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!getVcsCredentialPublic(id)) return reply.code(404).send({ error: 'not found' });
    deleteVcsCredential(id);
    return { ok: true };
  });

  app.get('/api/projects/:id/vcs', async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = getProject(id);
    if (!project) return reply.code(404).send({ error: 'project not found' });
    return {
      vcsProvider: project.vcsProvider ?? null,
      vcsRepo: project.vcsRepo ?? null,
      vcsCredentialId: project.vcsCredentialId ?? null,
    };
  });

  // ── GitHub OAuth ────────────────────────────────────────────────────────
  // The user must register an OAuth app on GitHub themselves (we don't
  // automate that), paste the client id + secret into config.json, then
  // navigate to /api/vcs/github/oauth/start. On callback we exchange the
  // code, create a new vcs_credentials row, and redirect to the dashboard.
  //
  // CSRF defence: we mint a single-use state token and require it to come
  // back in the callback. The token is held in-memory; restarts during the
  // flow will lose it (acceptable for a single-user local dashboard).
  const oauthStateTokens = new Set<string>();

  app.get('/api/vcs/github/oauth/start', async (req, reply) => {
    const cfg = getGithubOAuthRuntime();
    if (!cfg || !cfg.clientId || !cfg.clientSecret) {
      return reply.code(412).send({
        error: 'GitHub OAuth not configured — set githubOAuth.clientId / clientSecret in config.json',
      });
    }
    const state = randomBytes(16).toString('hex');
    oauthStateTokens.add(state);
    // Forget tokens older than 10 minutes — keeps the set bounded.
    setTimeout(() => oauthStateTokens.delete(state), 10 * 60 * 1000).unref?.();
    const base = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host ?? '';
    const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'http';
    const redirectUri = `${proto}://${base}/api/vcs/github/oauth/callback`;
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: redirectUri,
      scope: 'repo',
      state,
      allow_signup: 'false',
    });
    reply.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
  });

  app.get('/api/vcs/github/oauth/callback', async (req, reply) => {
    const cfg = getGithubOAuthRuntime();
    if (!cfg || !cfg.clientId || !cfg.clientSecret) {
      return reply.code(412).send({ error: 'GitHub OAuth not configured' });
    }
    const q = (req.query as { code?: string; state?: string; error?: string }) ?? {};
    if (q.error) return reply.code(400).send({ error: `github oauth: ${q.error}` });
    if (!q.code || !q.state) return reply.code(400).send({ error: 'missing code or state' });
    if (!oauthStateTokens.has(q.state)) {
      return reply.code(400).send({ error: 'invalid or expired state token' });
    }
    oauthStateTokens.delete(q.state);
    try {
      const res = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'BuildPilot',
        },
        body: JSON.stringify({
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          code: q.code,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        logger.warn({ status: res.status, text: text.slice(0, 200) }, 'github oauth exchange failed');
        return reply.code(502).send({ error: `oauth exchange ${res.status}` });
      }
      const data = (await res.json()) as { access_token?: string; error?: string };
      if (!data.access_token) {
        return reply.code(502).send({ error: data.error ?? 'no access_token returned' });
      }
      const cred = createVcsCredential({
        name: `GitHub OAuth (${new Date().toISOString().slice(0, 16)})`,
        provider: 'github',
        vcsToken: data.access_token,
      });
      // Hand the user back to the dashboard with the freshly created cred id
      // highlighted. The redirect target is overridable so SaaS deployments
      // can land on a custom path.
      const after = cfg.redirectAfter && cfg.redirectAfter.length > 0
        ? cfg.redirectAfter
        : '/vcs-credentials';
      const sep = after.includes('?') ? '&' : '?';
      reply.redirect(`${after}${sep}createdId=${encodeURIComponent(cred.id)}`);
    } catch (err) {
      logger.warn({ err: String(err) }, 'github oauth callback crashed');
      return reply.code(502).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.put('/api/projects/:id/vcs', async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = getProject(id);
    if (!project) return reply.code(404).send({ error: 'project not found' });
    const body = (req.body ?? {}) as Partial<ProjectVcsUpdate>;
    // Allow explicit clear by passing null on every field. Anything else
    // gets validated.
    const provider = (body.vcsProvider as VcsProvider | null | undefined) ?? null;
    const repo = body.vcsRepo ?? null;
    const credId = body.vcsCredentialId ?? null;
    if (provider !== null && !PROVIDERS.includes(provider)) {
      return reply.code(400).send({ error: 'invalid provider' });
    }
    if (credId !== null && !getVcsCredentialPublic(credId)) {
      return reply.code(400).send({ error: 'unknown vcsCredentialId' });
    }
    const updated = updateProjectVcs(id, {
      vcsProvider: provider,
      vcsRepo: repo,
      vcsCredentialId: credId,
    });
    return {
      vcsProvider: updated?.vcsProvider ?? null,
      vcsRepo: updated?.vcsRepo ?? null,
      vcsCredentialId: updated?.vcsCredentialId ?? null,
    };
  });
}
