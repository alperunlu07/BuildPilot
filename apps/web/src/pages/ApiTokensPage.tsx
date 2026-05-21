// Cluster 11.A — API token management.
//
// Plaintext tokens are only shown once on creation. After that the list
// surfaces metadata (name, owner, created, last used) and a revoke button.

import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  KeyRound,
  Plus,
  Trash2,
} from 'lucide-react';
import type { ApiToken, CreatedApiToken } from '@buildpilot/shared-types';
import { api } from '../lib/api';
import { useStore } from '../store/store';

export function ApiTokensPage() {
  const currentUser = useStore((s) => s.currentUser);
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createdToken, setCreatedToken] = useState<CreatedApiToken | null>(null);

  async function reload(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      setTokens(await api.listApiTokens());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function revoke(t: ApiToken): Promise<void> {
    if (!window.confirm(`Revoke token "${t.name}"? Any CI script using it will start failing.`)) {
      return;
    }
    try {
      await api.deleteApiToken(t.id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-3 sm:p-4 md:p-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-text-primary">
            <KeyRound size={18} className="text-amber-400" />
            API tokens
          </h1>
          <p className="text-xs text-text-muted">
            Long-lived bearer tokens for CI scripts. Pass them as{' '}
            <code className="rounded bg-bg-elevated px-1 py-0.5 text-xs">
              Authorization: Bearer &lt;token&gt;
            </code>
            . Tokens inherit the owner's role.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="focusable flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
        >
          <Plus size={14} />
          New token
        </button>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-rose-700/50 bg-rose-900/30 px-3 py-2 text-xs text-rose-200">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {createdToken && (
        <CreatedTokenBanner token={createdToken} onDismiss={() => setCreatedToken(null)} />
      )}

      {loading ? (
        <div className="text-sm text-text-muted">Loading…</div>
      ) : tokens.length === 0 ? (
        <div className="rounded-md border border-border-subtle bg-bg-panel/60 p-6 text-sm text-text-muted">
          No tokens. Create one to call BuildPilot from CI scripts.
        </div>
      ) : (
        <table className="w-full overflow-hidden rounded-md border border-border-subtle text-sm">
          <thead className="bg-bg-panel text-xs uppercase tracking-wider text-text-muted">
            <tr>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Owner</th>
              <th className="px-3 py-2 text-left">Created</th>
              <th className="px-3 py-2 text-left">Last used</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {tokens.map((t) => (
              <tr key={t.id} className="border-t border-border-subtle hover:bg-bg-panel/60">
                <td className="px-3 py-2 text-text-primary">{t.name}</td>
                <td className="px-3 py-2 text-xs text-text-secondary">
                  <span className="font-mono">{t.ownerUsername}</span>
                  <span className="ml-1 text-[10px] uppercase tracking-wider text-text-faint">
                    {t.ownerRole}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-text-muted">
                  {new Date(t.createdAt).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-xs text-text-muted">
                  {t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString() : <span className="text-text-faint">never</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => void revoke(t)}
                    className="focusable rounded p-1 text-text-muted hover:text-rose-400"
                    aria-label="Revoke token"
                    title="Revoke token"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showCreate && currentUser && (
        <CreateTokenDialog
          ownerId={currentUser.id}
          onClose={() => setShowCreate(false)}
          onCreated={(token) => {
            setShowCreate(false);
            setCreatedToken(token);
            void reload();
          }}
        />
      )}
      {showCreate && !currentUser && (
        <CreateTokenDialog
          ownerId={null}
          onClose={() => setShowCreate(false)}
          onCreated={(token) => {
            setShowCreate(false);
            setCreatedToken(token);
            void reload();
          }}
        />
      )}
    </div>
  );
}

function CreatedTokenBanner({
  token,
  onDismiss,
}: {
  token: CreatedApiToken;
  onDismiss(): void;
}) {
  const [copied, setCopied] = useState(false);
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(token.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }
  return (
    <div className="rounded-md border border-emerald-700/50 bg-emerald-900/20 p-4 text-sm text-emerald-100">
      <div className="mb-2 flex items-center gap-2">
        <CheckCircle2 size={14} className="text-emerald-300" />
        <strong>Token created.</strong>
      </div>
      <p className="text-xs text-emerald-200">
        Copy this value now — it will not be shown again. The bcrypt hash is the only
        thing stored on the server.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <code className="flex-1 break-all rounded bg-bg-base px-2 py-1.5 font-mono text-xs text-emerald-200">
          {token.token}
        </code>
        <button
          type="button"
          onClick={() => void copy()}
          className="focusable inline-flex items-center gap-1 rounded-md border border-emerald-700 px-2 py-1.5 text-xs text-emerald-200 hover:border-emerald-400"
        >
          <Copy size={12} />
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="focusable rounded-md border border-emerald-700 px-2 py-1.5 text-xs text-emerald-200 hover:border-emerald-400"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

function CreateTokenDialog({
  ownerId,
  onClose,
  onCreated,
}: {
  ownerId: string | null;
  onClose(): void;
  onCreated(t: CreatedApiToken): void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const token = await api.createApiToken({
        name,
        ...(ownerId ? { userId: ownerId } : {}),
      });
      onCreated(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-base/70 px-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="density-card w-full max-w-md space-y-3 rounded-lg border border-border-subtle bg-bg-panel p-5 shadow-2xl"
      >
        <h2 className="text-base font-semibold text-text-primary">Create API token</h2>
        <p className="text-xs text-text-muted">
          Pick a memorable name so you can identify it later (e.g. "deploy.sh", "ci-runner-01").
        </p>
        <div className="space-y-1">
          <label className="text-xs font-medium text-text-secondary">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="focusable w-full rounded-md border border-border-subtle bg-bg-base px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            placeholder="e.g. release-pipeline"
            autoFocus
          />
        </div>
        {error && (
          <div className="rounded border border-rose-700/50 bg-rose-900/30 px-2 py-1 text-xs text-rose-200">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="focusable rounded-md border border-border-subtle px-3 py-1.5 text-xs text-text-secondary hover:border-text-faint"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="focusable rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {submitting ? 'Creating…' : 'Create token'}
          </button>
        </div>
      </form>
    </div>
  );
}
