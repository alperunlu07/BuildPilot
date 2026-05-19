import type { Build, CheckRunState, Pipeline, Project } from '@buildpilot/shared-types';
import { logger } from '../logger';
import { getVcsCredentialRuntime } from '../store/vcsCredentials';
import { getCheckRun, upsertCheckRun } from '../store/vcsCheckRuns';
import { githubClient, fetchGithubPrsForSha } from './github';
import { gitlabClient, fetchGitlabMrsForSha } from './gitlab';
import { giteaClient, fetchGiteaPrsForSha } from './gitea';
import type { VcsClient, VcsPrFetchResult } from './types';

// Cluster 11.E — facade. Engine code (which knows about projects + builds +
// pipelines) talks to this module, not the provider clients directly.

function parseRepo(repo: string): { owner: string; name: string } | null {
  // Accept "owner/repo" and "group/subgroup/repo" (GitLab). We split on the
  // LAST slash so the namespace can contain slashes; everything before
  // becomes the owner string.
  const idx = repo.lastIndexOf('/');
  if (idx <= 0 || idx === repo.length - 1) return null;
  return { owner: repo.slice(0, idx), name: repo.slice(idx + 1) };
}

function clientFor(
  project: Project,
): { client: VcsClient; baseUrl: string | null; token: string } | null {
  if (!project.vcsProvider || !project.vcsCredentialId || !project.vcsRepo) return null;
  const cred = getVcsCredentialRuntime(project.vcsCredentialId);
  if (!cred) return null;
  if (cred.provider !== project.vcsProvider) {
    // Credential and project disagree — refuse to post under the wrong
    // identity rather than silently mapping.
    logger.warn(
      { projectId: project.id, provider: project.vcsProvider, credProvider: cred.provider },
      'vcs: project/credential provider mismatch',
    );
    return null;
  }
  let client: VcsClient;
  if (cred.provider === 'github') client = githubClient({ token: cred.token, baseUrl: cred.baseUrl });
  else if (cred.provider === 'gitlab') client = gitlabClient({ token: cred.token, baseUrl: cred.baseUrl });
  else client = giteaClient({ token: cred.token, baseUrl: cred.baseUrl });
  return { client, baseUrl: cred.baseUrl, token: cred.token };
}

export interface PostCheckRunArgs {
  project: Project;
  pipeline: Pipeline;
  build: Build;
  state: CheckRunState;
  summary?: string;
  detailsUrl?: string;
}

// Fire-and-forget outbound poster called from the engine.
//
// Skips silently when:
//   - the project has no VCS link
//   - the build has no triggerSha (e.g. a manual local run)
//
// Reruns: we look up the previous external ref (GitHub check_run id) and
// PATCH it instead of creating a new row. GitLab/Gitea overwrite by
// (sha, context) natively so they don't need the ref.
export async function postCheckRun(args: PostCheckRunArgs): Promise<void> {
  const { project, pipeline, build, state } = args;
  if (!build.triggerSha) return;
  const c = clientFor(project);
  if (!c) return;
  const parsed = parseRepo(project.vcsRepo!);
  if (!parsed) {
    logger.warn({ projectId: project.id, vcsRepo: project.vcsRepo }, 'vcs: malformed repo string');
    return;
  }
  const name = `BuildPilot · ${pipeline.name}`;
  const existing = getCheckRun(build.id, c.client.provider);
  const res = await c.client.postCheckRun(
    {
      owner: parsed.owner,
      repo: parsed.name,
      sha: build.triggerSha,
      state,
      name,
      detailsUrl: args.detailsUrl,
      summary: args.summary,
    },
    existing?.ref,
  );
  if (!res.ok) {
    logger.warn(
      { provider: c.client.provider, buildId: build.id, error: res.error },
      'vcs: postCheckRun failed',
    );
    return;
  }
  upsertCheckRun({
    buildId: build.id,
    provider: c.client.provider,
    ref: res.ref ?? existing?.ref ?? '',
    state,
    updatedAt: Date.now(),
  });
}

// Sync flavour: returns the success/failure so the HTTP API can surface
// any error to the caller. Used by /api/projects/:id/vcs/test.
export async function postCheckRunSync(args: PostCheckRunArgs): Promise<{ ok: boolean; error?: string }> {
  if (!args.build.triggerSha) return { ok: false, error: 'build has no triggerSha' };
  const c = clientFor(args.project);
  if (!c) return { ok: false, error: 'project has no VCS link' };
  const parsed = parseRepo(args.project.vcsRepo!);
  if (!parsed) return { ok: false, error: 'malformed vcsRepo' };
  const name = `BuildPilot · ${args.pipeline.name}`;
  const existing = getCheckRun(args.build.id, c.client.provider);
  const res = await c.client.postCheckRun(
    {
      owner: parsed.owner,
      repo: parsed.name,
      sha: args.build.triggerSha,
      state: args.state,
      name,
      detailsUrl: args.detailsUrl,
      summary: args.summary,
    },
    existing?.ref,
  );
  if (res.ok) {
    upsertCheckRun({
      buildId: args.build.id,
      provider: c.client.provider,
      ref: res.ref ?? existing?.ref ?? '',
      state: args.state,
      updatedAt: Date.now(),
    });
  }
  return res;
}

// Pull PR context for a sha. Returns null when the project has no VCS link,
// or throws when the provider call fails (the route catches and returns 502).
export async function fetchPrContextForBuild(
  project: Project,
  sha: string,
): Promise<{ provider: 'github' | 'gitlab' | 'gitea'; repo: string; result: VcsPrFetchResult } | null> {
  const c = clientFor(project);
  if (!c) return null;
  const parsed = parseRepo(project.vcsRepo!);
  if (!parsed) return null;
  let result: VcsPrFetchResult;
  if (c.client.provider === 'github') {
    result = await fetchGithubPrsForSha(
      { token: c.token, baseUrl: c.baseUrl },
      { owner: parsed.owner, repo: parsed.name, sha },
    );
  } else if (c.client.provider === 'gitlab') {
    result = await fetchGitlabMrsForSha(
      { token: c.token, baseUrl: c.baseUrl },
      { owner: parsed.owner, repo: parsed.name, sha },
    );
  } else {
    result = await fetchGiteaPrsForSha(
      { token: c.token, baseUrl: c.baseUrl },
      { owner: parsed.owner, repo: parsed.name, sha },
    );
  }
  return { provider: c.client.provider, repo: project.vcsRepo!, result };
}
