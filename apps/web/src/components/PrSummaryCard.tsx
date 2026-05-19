import { useEffect, useState } from 'react';
import { GitPullRequest, ExternalLink, AlertCircle } from 'lucide-react';
import type { PrSummary } from '@buildpilot/shared-types';
import { api } from '../lib/api';

// Cluster 11.E · PR summary card. Renders at the top of BuildDetailPage
// when the build's commit is associated with one or more PRs. Fetched
// lazily on mount so the build view still renders fast for builds that
// have no VCS link.

interface Props {
  buildId: string;
}

interface State {
  loading: boolean;
  error: string | null;
  prs: PrSummary[];
  provider: string | null;
  repo: string | null;
}

const INITIAL: State = {
  loading: true,
  error: null,
  prs: [],
  provider: null,
  repo: null,
};

function stateColors(state: PrSummary['state']): string {
  switch (state) {
    case 'open':
      return 'bg-emerald-950/40 text-emerald-300 border-emerald-700/50';
    case 'merged':
      return 'bg-violet-950/40 text-violet-300 border-violet-700/50';
    case 'closed':
      return 'bg-slate-800 text-slate-400 border-slate-700';
  }
}

export function PrSummaryCard({ buildId }: Props) {
  const [state, setState] = useState<State>(INITIAL);

  useEffect(() => {
    let alive = true;
    setState(INITIAL);
    api
      .buildPrContext(buildId)
      .then((data) => {
        if (!alive) return;
        setState({
          loading: false,
          error: null,
          prs: data.prs,
          provider: data.provider,
          repo: data.repo,
        });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setState({
          loading: false,
          error: err instanceof Error ? err.message : String(err),
          prs: [],
          provider: null,
          repo: null,
        });
      });
    return () => {
      alive = false;
    };
  }, [buildId]);

  if (state.loading) return null;
  // No project link configured — render nothing (we don't want to nag).
  if (!state.error && state.prs.length === 0 && !state.provider) return null;
  // Configured but provider returned no PRs (likely a direct push to a
  // branch without an open PR). Show a faint hint so users understand
  // why no PR card appeared, but keep it small.
  if (!state.error && state.prs.length === 0) {
    return (
      <div className="border-b border-slate-800 bg-slate-900/30 px-3 py-2 text-[11px] text-slate-500 sm:px-6">
        <GitPullRequest size={11} className="mr-1 inline" />
        No open PR for this commit on {state.repo} ({state.provider}).
      </div>
    );
  }
  if (state.error) {
    return (
      <div className="border-b border-amber-700/50 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-300 sm:px-6">
        <AlertCircle size={11} className="mr-1 inline" />
        Could not load PR context: {state.error}
      </div>
    );
  }

  return (
    <div className="border-b border-slate-800 bg-slate-900/30 px-3 py-3 sm:px-6">
      <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-400">
        Linked {state.prs.length > 1 ? `pull requests (${state.prs.length})` : 'pull request'}
        {state.repo && (
          <span className="ml-2 text-slate-500">
            · {state.repo} ({state.provider})
          </span>
        )}
      </div>
      <ul className="space-y-2">
        {state.prs.map((pr) => (
          <li
            key={pr.number}
            className="rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2"
          >
            <div className="flex flex-wrap items-baseline gap-2">
              <a
                href={pr.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-sky-400 hover:underline"
              >
                #{pr.number} {pr.title}
                <ExternalLink size={11} />
              </a>
              <span
                className={`rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${stateColors(
                  pr.state,
                )}`}
              >
                {pr.state}
              </span>
              {pr.authorLogin && (
                <span className="text-[11px] text-slate-400">by @{pr.authorLogin}</span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
              <span className="font-mono">
                <span className="text-emerald-400">{pr.headBranch}</span>
                <span className="text-slate-500"> → </span>
                <span className="text-sky-400">{pr.baseBranch}</span>
              </span>
              {pr.labels.length > 0 && (
                <span className="flex flex-wrap gap-1">
                  {pr.labels.slice(0, 6).map((l) => (
                    <span
                      key={l}
                      className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300"
                    >
                      {l}
                    </span>
                  ))}
                </span>
              )}
              {pr.linkedIssues.length > 0 && (
                <span className="text-slate-400">
                  refs:{' '}
                  {pr.linkedIssues.slice(0, 5).map((n, i) => (
                    <span key={n} className="font-mono text-slate-300">
                      {i > 0 && ', '}#{n}
                    </span>
                  ))}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
