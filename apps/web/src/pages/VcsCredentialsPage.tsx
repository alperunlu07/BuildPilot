import { useEffect, useMemo, useState } from 'react';
import { Github, GitBranch, Plus, Trash2, Github as GhIcon } from 'lucide-react';
import type { VcsCredential, VcsProvider } from '@buildpilot/shared-types';
import { api } from '../lib/api';
import { Time } from '../lib/formatDate';

// Cluster 11.E · VCS credentials page. Manages the tokens BuildPilot uses
// to POST check-runs back to GitHub / GitLab / Gitea. Linking a credential
// to a specific project happens on the project detail page; this page is
// the canonical store of the tokens themselves.

interface DraftCred {
  name: string;
  provider: VcsProvider;
  baseUrl: string;
  vcsToken: string;
}

const EMPTY_DRAFT: DraftCred = {
  name: '',
  provider: 'github',
  baseUrl: '',
  vcsToken: '',
};

function highlightId(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('createdId');
}

export function VcsCredentialsPage() {
  const [creds, setCreds] = useState<VcsCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [draft, setDraft] = useState<DraftCred>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [highlightedId] = useState<string | null>(() => highlightId());

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      const list = await api.listVcsCredentials();
      setCreds(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function onCreate() {
    if (!draft.name.trim()) {
      setError('Name required');
      return;
    }
    if (!draft.vcsToken.trim()) {
      setError('Token required');
      return;
    }
    if (draft.provider === 'gitea' && !draft.baseUrl.trim()) {
      setError('Gitea requires a base URL (e.g. https://gitea.example.com)');
      return;
    }
    setBusy(true);
    try {
      await api.createVcsCredential({
        name: draft.name.trim(),
        provider: draft.provider,
        baseUrl: draft.baseUrl.trim() || undefined,
        vcsToken: draft.vcsToken,
      });
      setDraft(EMPTY_DRAFT);
      setShowEditor(false);
      setError(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm('Delete this VCS credential? Projects using it will lose outbound check-runs.')) return;
    setBusy(true);
    try {
      await api.deleteVcsCredential(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const sorted = useMemo(() => [...creds].sort((a, b) => b.createdAt - a.createdAt), [creds]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3 sm:px-6">
        <div>
          <h1 className="text-base font-semibold text-slate-100">VCS credentials</h1>
          <p className="text-xs text-slate-400">
            Tokens used to POST check-runs / commit statuses back to GitHub, GitLab, and Gitea.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/vcs/github/oauth/start"
            className="focusable inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:border-sky-500 hover:text-sky-400"
            title="Start GitHub OAuth flow (requires githubOAuth configured in config.json)"
          >
            <GhIcon size={12} /> GitHub OAuth
          </a>
          <button
            type="button"
            onClick={() => {
              setShowEditor(true);
              setDraft(EMPTY_DRAFT);
              setError(null);
            }}
            className="focusable inline-flex items-center gap-1 rounded-md bg-sky-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-500"
          >
            <Plus size={12} /> Add credential
          </button>
        </div>
      </header>

      {error && (
        <div className="border-b border-rose-800/50 bg-rose-950/30 px-4 py-2 text-xs text-rose-200 sm:px-6">
          {error}
        </div>
      )}

      {showEditor && (
        <div className="border-b border-slate-800 bg-slate-900/40 px-4 py-3 sm:px-6">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block text-xs text-slate-300">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-400">Name</span>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. GitHub PAT (alperunlu07)"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200 focus:border-sky-500 focus:outline-none"
              />
            </label>
            <label className="block text-xs text-slate-300">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-400">Provider</span>
              <select
                value={draft.provider}
                onChange={(e) => setDraft({ ...draft, provider: e.target.value as VcsProvider })}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200 focus:border-sky-500 focus:outline-none"
              >
                <option value="github">GitHub</option>
                <option value="gitlab">GitLab</option>
                <option value="gitea">Gitea</option>
              </select>
            </label>
            <label className="block text-xs text-slate-300 md:col-span-2">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-400">
                Base URL{' '}
                <span className="text-slate-500">
                  (optional for github.com / gitlab.com; required for self-hosted + Gitea)
                </span>
              </span>
              <input
                type="text"
                value={draft.baseUrl}
                onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
                placeholder="https://gitea.example.com"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200 focus:border-sky-500 focus:outline-none"
              />
            </label>
            <label className="block text-xs text-slate-300 md:col-span-2">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-400">
                Personal access token / OAuth bearer
              </span>
              <input
                type="password"
                value={draft.vcsToken}
                onChange={(e) => setDraft({ ...draft, vcsToken: e.target.value })}
                placeholder="ghp_… / glpat_… / gita_…"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-slate-200 focus:border-sky-500 focus:outline-none"
              />
            </label>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowEditor(false)}
              className="focusable rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-500"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onCreate}
              className="focusable rounded-md bg-sky-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save credential'}
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto px-4 py-3 sm:px-6">
        {loading && <div className="text-xs text-slate-400">Loading…</div>}
        {!loading && sorted.length === 0 && (
          <div className="rounded-md border border-dashed border-slate-700 px-4 py-6 text-center text-xs text-slate-400">
            No credentials yet. Add one above, or start the GitHub OAuth flow.
          </div>
        )}
        {!loading && sorted.length > 0 && (
          <ul className="space-y-2">
            {sorted.map((c) => (
              <li
                key={c.id}
                className={`rounded-md border px-3 py-2 ${
                  c.id === highlightedId
                    ? 'border-sky-500 bg-sky-950/30'
                    : 'border-slate-800 bg-slate-900/40'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      {c.provider === 'github' && <Github size={12} className="text-slate-300" />}
                      {c.provider !== 'github' && <GitBranch size={12} className="text-emerald-400" />}
                      <span className="font-medium text-slate-100">{c.name}</span>
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
                        {c.provider}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                      {c.baseUrl && <span>at {c.baseUrl}</span>}
                      <span>
                        token: <span className="font-mono">{c.tokenPreview || '(empty)'}</span>
                      </span>
                      <span>
                        added <Time ts={c.createdAt} />
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDelete(c.id)}
                    className="focusable rounded-md p-1 text-slate-400 hover:text-rose-400"
                    aria-label="Delete credential"
                    title="Delete credential"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
