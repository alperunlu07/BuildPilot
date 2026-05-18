import type { CheckRunState } from '@buildpilot/shared-types';
import type {
  PostCheckRunInput,
  PostCheckRunResult,
  PrFetchInput,
  VcsClient,
  VcsPrFetchResult,
} from './types';

// Cluster 11.E — GitHub outbound poster.
//
// Two surfaces:
//   - Check Runs API: https://docs.github.com/en/rest/checks/runs
//     Lets us draw a green/red dot next to BuildPilot on the PR and
//     attach a details URL + structured output.
//   - List Pulls associated with commit:
//     GET /repos/{owner}/{repo}/commits/{sha}/pulls — used by the PR
//     summary card.
//
// We rely on Node 20's global fetch (no `octokit`). Reruns reuse the same
// check_run id by issuing a PATCH; that's how GitHub natively handles
// "cancel + repost" (the previous row is replaced in-place).

const DEFAULT_BASE = 'https://api.github.com';

function apiBase(baseUrl: string | null | undefined): string {
  if (!baseUrl) return DEFAULT_BASE;
  // For GitHub Enterprise Server, the REST root is `<host>/api/v3` — but the
  // user pastes the host into baseUrl, so accept either shape.
  const trimmed = baseUrl.replace(/\/$/, '');
  if (trimmed.endsWith('/api/v3')) return trimmed;
  // Detect "looks like an Enterprise host" vs. the dotcom URL.
  if (trimmed === 'https://api.github.com') return trimmed;
  return `${trimmed}/api/v3`;
}

interface ApiCheckRun {
  status: 'queued' | 'in_progress' | 'completed';
  conclusion?: 'success' | 'failure' | 'cancelled' | 'timed_out' | 'action_required' | 'neutral' | 'skipped';
}

function mapState(state: CheckRunState): ApiCheckRun {
  switch (state) {
    case 'queued':
      return { status: 'queued' };
    case 'in_progress':
      return { status: 'in_progress' };
    case 'success':
      return { status: 'completed', conclusion: 'success' };
    case 'failure':
      return { status: 'completed', conclusion: 'failure' };
    case 'cancelled':
      return { status: 'completed', conclusion: 'cancelled' };
  }
}

function headers(token: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'BuildPilot',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export function githubClient(opts: { token: string; baseUrl: string | null }): VcsClient {
  const base = apiBase(opts.baseUrl);
  return {
    provider: 'github',
    async postCheckRun(input: PostCheckRunInput, existingRef?: string): Promise<PostCheckRunResult> {
      const status = mapState(input.state);
      const body: Record<string, unknown> = {
        name: input.name,
        head_sha: input.sha,
        status: status.status,
        ...(status.conclusion ? { conclusion: status.conclusion } : {}),
        ...(input.detailsUrl ? { details_url: input.detailsUrl } : {}),
        ...(input.output
          ? {
              output: {
                title: input.output.title ?? input.name,
                summary: input.output.summary ?? input.summary ?? '',
                ...(input.output.text ? { text: input.output.text } : {}),
              },
            }
          : input.summary
            ? { output: { title: input.name, summary: input.summary } }
            : {}),
      };
      const url = existingRef
        ? `${base}/repos/${input.owner}/${input.repo}/check-runs/${existingRef}`
        : `${base}/repos/${input.owner}/${input.repo}/check-runs`;
      const method = existingRef ? 'PATCH' : 'POST';
      try {
        const res = await fetch(url, {
          method,
          headers: headers(opts.token),
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          return { ok: false, error: `github ${method} ${url} → ${res.status} ${text.slice(0, 200)}` };
        }
        const data = (await res.json()) as { id?: number };
        return { ok: true, ref: data.id != null ? String(data.id) : existingRef };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

// PR-context fetch — not on VcsClient because GitLab/Gitea use different
// surfaces. Exposed as a free function the API layer calls directly.
export async function fetchGithubPrsForSha(
  opts: { token: string; baseUrl: string | null },
  input: PrFetchInput,
): Promise<VcsPrFetchResult> {
  const base = apiBase(opts.baseUrl);
  const url = `${base}/repos/${input.owner}/${input.repo}/commits/${input.sha}/pulls`;
  const res = await fetch(url, {
    headers: {
      ...headers(opts.token),
      // Older GitHub API required this preview header; ignored on modern GH
      // but harmless. Keep so GitHub Enterprise 2.x installs still work.
      Accept: 'application/vnd.github.groot-preview+json, application/vnd.github+json',
    },
  });
  if (!res.ok) {
    throw new Error(`github prs-for-sha ${res.status}`);
  }
  const data = (await res.json()) as Array<{
    number: number;
    title: string;
    state: 'open' | 'closed';
    merged_at?: string | null;
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
      state: pr.merged_at ? 'merged' : pr.state,
      url: pr.html_url,
      authorLogin: pr.user?.login ?? null,
      headBranch: pr.head.ref,
      baseBranch: pr.base.ref,
      labels: (pr.labels ?? []).map((l) => l.name),
      body: pr.body ?? '',
    })),
  };
}
