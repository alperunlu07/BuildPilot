import type { CheckRunState } from '@buildpilot/shared-types';
import type {
  PostCheckRunInput,
  PostCheckRunResult,
  PrFetchInput,
  VcsClient,
  VcsPrFetchResult,
} from './types';

// Cluster 11.E — Gitea outbound poster.
//
// Surface:
//   POST /api/v1/repos/:owner/:repo/statuses/:sha
//   GET  /api/v1/repos/:owner/:repo/commits/:sha/pulls
//
// Like GitLab, Gitea overwrites by (sha, context) — so reruns are idempotent.

function apiBase(baseUrl: string | null | undefined): string {
  if (!baseUrl) {
    throw new Error('Gitea requires a baseUrl (no public default exists).');
  }
  const trimmed = baseUrl.replace(/\/$/, '');
  if (trimmed.endsWith('/api/v1')) return trimmed;
  return `${trimmed}/api/v1`;
}

function mapState(state: import('@buildpilot/shared-types').CheckRunState): 'pending' | 'success' | 'error' | 'failure' | 'warning' {
  switch (state) {
    case 'queued':
    case 'in_progress':
      return 'pending';
    case 'success':
      return 'success';
    case 'failure':
      return 'failure';
    case 'cancelled':
      return 'warning';
  }
}

function headers(token: string): Record<string, string> {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'BuildPilot',
    Authorization: `token ${token}`,
  };
}

export function giteaClient(opts: { token: string; baseUrl: string | null }): VcsClient {
  return {
    provider: 'gitea',
    async postCheckRun(input: PostCheckRunInput): Promise<PostCheckRunResult> {
      let base: string;
      try {
        base = apiBase(opts.baseUrl);
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
      const url = `${base}/repos/${input.owner}/${input.repo}/statuses/${input.sha}`;
      const body: Record<string, unknown> = {
        state: mapState(input.state),
        context: input.name,
        ...(input.detailsUrl ? { target_url: input.detailsUrl } : {}),
        ...(input.summary ? { description: input.summary.slice(0, 250) } : {}),
      };
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: headers(opts.token),
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          return { ok: false, error: `gitea POST → ${res.status} ${text.slice(0, 200)}` };
        }
        return { ok: true, ref: input.name };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

export async function fetchGiteaPrsForSha(
  opts: { token: string; baseUrl: string | null },
  input: PrFetchInput,
): Promise<VcsPrFetchResult> {
  const base = apiBase(opts.baseUrl);
  // Gitea exposes a per-sha list endpoint as of v1.20:
  //   /repos/{owner}/{repo}/commits/{sha}/pulls
  // Older instances 404 here — surface the error to the caller.
  const url = `${base}/repos/${input.owner}/${input.repo}/commits/${input.sha}/pulls`;
  const res = await fetch(url, { headers: headers(opts.token) });
  if (!res.ok) throw new Error(`gitea prs-for-sha ${res.status}`);
  const data = (await res.json()) as Array<{
    number: number;
    title: string;
    state: 'open' | 'closed';
    merged: boolean;
    html_url: string;
    user?: { login?: string };
    head: { ref: string };
    base: { ref: string };
    labels?: Array<{ name: string }>;
    body?: string;
  }>;
  return {
    prs: data.map((pr) => ({
      number: pr.number,
      title: pr.title,
      state: pr.merged ? 'merged' : pr.state,
      url: pr.html_url,
      authorLogin: pr.user?.login ?? null,
      headBranch: pr.head.ref,
      baseBranch: pr.base.ref,
      labels: (pr.labels ?? []).map((l) => l.name),
      body: pr.body ?? '',
    })),
  };
}

// Unused but exported so the bundler doesn't tree-shake the type import.
export type _CheckRunState = CheckRunState;
