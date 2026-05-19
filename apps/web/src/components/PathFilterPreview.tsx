import { useEffect, useMemo, useState } from 'react';
import { Check, X, ChevronRight, ChevronDown, Loader2, FileText } from 'lucide-react';
import type { Commit } from '@buildpilot/shared-types';
import { api } from '../lib/api';

interface Props {
  projectId: string;
  branch: string;
  value: string; // newline-separated globs
  onChange(globs: string): void;
  // Number of commits to render in the preview. Each one fetches its
  // changed files lazily when expanded — except the first few which we
  // eagerly load so the user sees match counts immediately.
  previewLimit?: number;
}

// Cluster 11.G — path-filter preview. Multi-line textarea of newline-
// separated globs; below it we render the last N commits and (when the
// commit is expanded) the changed files marked ✓/✗ against the filter.
// Matches the poller's `pathsMatchFilter` semantics: a commit "passes"
// the filter when at least one of its changed files matches at least
// one glob; an empty filter means everything passes.
function globToRegExp(glob: string): RegExp {
  let out = '';
  let i = 0;
  while (i < glob.length) {
    const ch = glob[i]!;
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        out += '.*';
        i += 2;
      } else {
        out += '[^/]*';
        i += 1;
      }
    } else if (ch === '?') {
      out += '[^/]';
      i += 1;
    } else if ('\\^$.+|()[]{}'.includes(ch)) {
      out += '\\' + ch;
      i += 1;
    } else {
      out += ch;
      i += 1;
    }
  }
  return new RegExp('^' + out + '$');
}

interface CompiledFilter {
  patterns: RegExp[];
  raw: string[];
}

function compileFilter(spec: string): CompiledFilter {
  const raw = spec
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return { patterns: raw.map(globToRegExp), raw };
}

function fileMatches(file: string, filter: CompiledFilter): boolean {
  if (filter.patterns.length === 0) return true;
  return filter.patterns.some((rx) => rx.test(file));
}

const EAGER_LOAD = 3;

export function PathFilterPreview({ projectId, branch, value, onChange, previewLimit = 10 }: Props) {
  const [commits, setCommits] = useState<Commit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // sha -> { files, loading, error }
  const [filesBySha, setFilesBySha] = useState<
    Record<string, { files?: string[]; loading?: boolean; error?: string }>
  >({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filter = useMemo(() => compileFilter(value), [value]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setCommits(null);
    setFilesBySha({});
    setExpanded(new Set());
    api
      .commits(projectId, { branch, limit: previewLimit })
      .then((rows) => {
        if (alive) setCommits(rows);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [projectId, branch, previewLimit]);

  // Eagerly fetch changed files for the first few commits so the user
  // can see match counts at a glance. Anything past that loads on
  // expand. We re-run this whenever the commit list changes (not when
  // the filter changes — match logic is client-side once files arrive).
  useEffect(() => {
    if (!commits) return;
    let alive = true;
    const eager = commits.slice(0, EAGER_LOAD);
    for (const c of eager) {
      if (filesBySha[c.sha]?.files !== undefined) continue;
      setFilesBySha((prev) => ({ ...prev, [c.sha]: { ...prev[c.sha], loading: true } }));
      api
        .commitChangedFiles(projectId, c.sha)
        .then(({ files }) => {
          if (!alive) return;
          setFilesBySha((prev) => ({ ...prev, [c.sha]: { files, loading: false } }));
        })
        .catch((err) => {
          if (!alive) return;
          setFilesBySha((prev) => ({
            ...prev,
            [c.sha]: { loading: false, error: err instanceof Error ? err.message : String(err) },
          }));
        });
    }
    return () => {
      alive = false;
    };
  }, [commits, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCommit = (sha: string) => {
    const next = new Set(expanded);
    if (next.has(sha)) {
      next.delete(sha);
    } else {
      next.add(sha);
      // Lazy-fetch on first expand
      if (filesBySha[sha]?.files === undefined && !filesBySha[sha]?.loading) {
        setFilesBySha((prev) => ({ ...prev, [sha]: { ...prev[sha], loading: true } }));
        api
          .commitChangedFiles(projectId, sha)
          .then(({ files }) => {
            setFilesBySha((prev) => ({ ...prev, [sha]: { files, loading: false } }));
          })
          .catch((err) => {
            setFilesBySha((prev) => ({
              ...prev,
              [sha]: { loading: false, error: err instanceof Error ? err.message : String(err) },
            }));
          });
      }
    }
    setExpanded(next);
  };

  const passes = (files: string[] | undefined): 'pass' | 'fail' | 'unknown' => {
    if (filter.patterns.length === 0) return 'pass';
    if (!files) return 'unknown';
    return files.some((f) => fileMatches(f, filter)) ? 'pass' : 'fail';
  };

  return (
    <div className="space-y-2">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder={'ios/**\nshared/**\n!docs/**'}
        spellCheck={false}
        className="w-full rounded-md border border-border-subtle bg-bg-base px-2 py-1.5 font-mono text-xs text-text-primary focus:border-accent focus:outline-none"
      />

      <div className="text-[11px] text-text-muted">
        {filter.patterns.length === 0
          ? 'No filter — every commit triggers a build.'
          : `${filter.patterns.length} pattern${filter.patterns.length === 1 ? '' : 's'} active.`}
      </div>

      <div className="rounded border border-border-subtle bg-bg-base/40">
        <div className="border-b border-border-subtle px-2 py-1 text-[10px] uppercase tracking-wider text-text-faint">
          Last {previewLimit} commits on {branch || '(no branch)'}
        </div>
        {loading && (
          <div className="flex items-center gap-1.5 px-2 py-2 text-[11px] text-text-muted">
            <Loader2 size={11} className="animate-spin" /> Loading commits…
          </div>
        )}
        {error && (
          <div className="px-2 py-2 text-[11px] text-rose-300">Couldn't load commits: {error}</div>
        )}
        {!loading && !error && commits && commits.length === 0 && (
          <div className="px-2 py-2 text-[11px] text-text-muted">No commits.</div>
        )}
        {!loading && !error && commits && commits.length > 0 && (
          <ul className="divide-y divide-border-subtle/50">
            {commits.map((c) => {
              const state = filesBySha[c.sha];
              const verdict = passes(state?.files);
              const isExpanded = expanded.has(c.sha);
              return (
                <li key={c.sha} className="text-[11px]">
                  <button
                    type="button"
                    onClick={() => toggleCommit(c.sha)}
                    className="flex w-full items-center gap-1.5 px-2 py-1 text-left hover:bg-bg-panel/60"
                  >
                    {isExpanded ? (
                      <ChevronDown size={11} className="shrink-0 text-text-faint" />
                    ) : (
                      <ChevronRight size={11} className="shrink-0 text-text-faint" />
                    )}
                    {verdict === 'pass' ? (
                      <Check size={11} className="shrink-0 text-emerald-400" />
                    ) : verdict === 'fail' ? (
                      <X size={11} className="shrink-0 text-text-faint" />
                    ) : (
                      <Loader2 size={11} className="shrink-0 animate-spin text-text-faint" />
                    )}
                    <span className="shrink-0 font-mono text-text-faint">{c.shortSha}</span>
                    <span
                      className={`truncate ${
                        verdict === 'pass'
                          ? 'text-emerald-200'
                          : verdict === 'fail'
                            ? 'text-text-faint'
                            : 'text-text-secondary'
                      }`}
                    >
                      {c.subject || '(no subject)'}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border-subtle/50 bg-bg-base/40 px-2 py-1.5">
                      {state?.loading && (
                        <div className="flex items-center gap-1.5 text-[11px] text-text-faint">
                          <Loader2 size={10} className="animate-spin" /> Loading changed files…
                        </div>
                      )}
                      {state?.error && (
                        <div className="text-[11px] text-rose-300">
                          Couldn't load changed files: {state.error}
                        </div>
                      )}
                      {!state?.loading && !state?.error && state?.files && state.files.length === 0 && (
                        <div className="flex items-center gap-1.5 text-[11px] text-text-faint">
                          <FileText size={10} /> No changed files (root commit or merge?).
                        </div>
                      )}
                      {!state?.loading && !state?.error && state?.files && state.files.length > 0 && (
                        <ul className="space-y-0.5 font-mono">
                          {state.files.map((file) => {
                            const match = fileMatches(file, filter);
                            return (
                              <li
                                key={file}
                                className={`flex items-center gap-1.5 ${
                                  filter.patterns.length === 0
                                    ? 'text-text-secondary'
                                    : match
                                      ? 'text-emerald-200'
                                      : 'text-text-faint'
                                }`}
                              >
                                {filter.patterns.length === 0 ? (
                                  <span className="text-text-faint">·</span>
                                ) : match ? (
                                  <Check size={10} className="shrink-0 text-emerald-400" />
                                ) : (
                                  <X size={10} className="shrink-0 text-text-faint" />
                                )}
                                <span className="truncate">{file}</span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
