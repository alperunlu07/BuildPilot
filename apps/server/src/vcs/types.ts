import type { CheckRunState, VcsProvider } from '@buildpilot/shared-types';

// Shared shape used by every outbound provider client. The "state" → provider
// status mapping happens inside each client; callers stay vendor-agnostic.

export interface PostCheckRunInput {
  // owner/namespace of the repo, e.g. "alperunlu07" (GitHub/Gitea) or the
  // path-with-namespace prefix for GitLab.
  owner: string;
  repo: string;
  sha: string;
  state: CheckRunState;
  // Stable name shown on the PR (becomes GitHub's `context` /  GitLab
  // `context`). BuildPilot uses `BuildPilot · <pipelineName>`.
  name: string;
  // Optional link the user can click from the PR check.
  detailsUrl?: string;
  // Short one-line summary surfaced as the description.
  summary?: string;
  // Optional structured output (GitHub check-runs only — the other two
  // providers don't have an equivalent yet).
  output?: { title?: string; summary?: string; text?: string };
}

export interface PostCheckRunResult {
  ok: boolean;
  // Provider-specific id returned on success. We persist this so reruns can
  // hit the same external record instead of creating a new one.
  ref?: string;
  // Human-readable error from the provider, if any.
  error?: string;
}

export interface VcsClient {
  provider: VcsProvider;
  postCheckRun(input: PostCheckRunInput, existingRef?: string): Promise<PostCheckRunResult>;
}

export interface PrFetchInput {
  owner: string;
  repo: string;
  sha: string;
}

export interface VcsPrFetchResult {
  prs: Array<{
    number: number;
    title: string;
    state: 'open' | 'closed' | 'merged';
    url: string;
    authorLogin: string | null;
    headBranch: string;
    baseBranch: string;
    labels: string[];
    body: string;
  }>;
}
