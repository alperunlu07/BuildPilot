import type { CheckRunState } from '@buildpilot/shared-types';
import type {
  PostCheckRunInput,
  PostCheckRunResult,
  PrFetchInput,
  VcsClient,
  VcsPrFetchResult,
} from './types';

// Cluster 11.E — GitLab outbound poster.
//
// Surface:
//   POST /api/v4/projects/:id/statuses/:sha
//   GET  /api/v4/projects/:id/repository/commits/:sha/merge_requests
//
// GitLab updates by (sha, context) — re-POSTing the same name overrides
// the previous state, so reruns don't need a tracked id.

const DEFAULT_BASE = 'https://gitlab.com';

function apiBase(baseUrl: string | null | undefined): string {
  const trimmed = (baseUrl ?? DEFAULT_BASE).replace(/\/$/, '');
  if (trimmed.endsWith('/api/v4')) return trimmed;
  return `${trimmed}/api/v4`;
}

function mapState(state: CheckRunState): 'pending' | 'running' | 'success' | 'failed' | 'canceled' {
  switch (state) {
    case 'queued':
      return 'pending';
    case 'in_progress':
      return 'running';
    case 'success':
      return 'success';
    case 'failure':
      return 'failed';
    case 'cancelled':
      return 'canceled';
  }
}

function headers(token: string): Record<string, string> {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'BuildPilot',
    'PRIVATE-TOKEN': token,
  };
}

export function gitlabClient(opts: { token: string; baseUrl: string | null }): VcsClient {
  const base = apiBase(opts.baseUrl);
  return {
    provider: 'gitlab',
    async postCheckRun(input: PostCheckRunInput): Promise<PostCheckRunResult> {
      // GitLab encodes the full namespace path as URL-safe + URL-encoded.
      const projectId = encodeURIComponent(`${input.owner}/${input.repo}`);
      const url = `${base}/projects/${projectId}/statuses/${input.sha}`;
      const body: Record<string, unknown> = {
        state: mapState(input.state),
        name: input.name,
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
          return { ok: false, error: `gitlab POST → ${res.status} ${text.slice(0, 200)}` };
        }
        return { ok: true, ref: input.name };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

export async function fetchGitlabMrsForSha(
  opts: { token: string; baseUrl: string | null },
  input: PrFetchInput,
): Promise<VcsPrFetchResult> {
  const base = apiBase(opts.baseUrl);
  const projectId = encodeURIComponent(`${input.owner}/${input.repo}`);
  const url = `${base}/projects/${projectId}/repository/commits/${input.sha}/merge_requests`;
  const res = await fetch(url, { headers: headers(opts.token) });
  if (!res.ok) throw new Error(`gitlab mrs-for-sha ${res.status}`);
  const data = (await res.json()) as Array<{
    iid: number;
    title: string;
    state: 'opened' | 'closed' | 'merged' | 'locked';
    web_url: string;
    author?: { username?: string };
    source_branch: string;
    target_branch: string;
    labels?: string[];
    description?: string;
  }>;
  return {
    prs: data.map((mr) => ({
      number: mr.iid,
      title: mr.title,
      state: mr.state === 'merged' ? 'merged' : mr.state === 'opened' ? 'open' : 'closed',
      url: mr.web_url,
      authorLogin: mr.author?.username ?? null,
      headBranch: mr.source_branch,
      baseBranch: mr.target_branch,
      labels: mr.labels ?? [],
      body: mr.description ?? '',
    })),
  };
}
