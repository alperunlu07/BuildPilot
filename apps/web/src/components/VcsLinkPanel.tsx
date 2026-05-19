import { useEffect, useState } from 'react';
import { Github } from 'lucide-react';
import type {
  ProjectVcsConfig,
  VcsCredential,
  VcsProvider,
} from '@buildpilot/shared-types';
import { api } from '../lib/api';
import { useStore } from '../store/store';

// Cluster 11.E · Per-project VCS link panel. Mounted in the ProjectDetailPage
// right column so users can wire a project to a credential + repo without
// leaving the project view.

interface Props {
  projectId: string;
}

export function VcsLinkPanel({ projectId }: Props) {
  const setView = useStore((s) => s.setView);
  const [creds, setCreds] = useState<VcsCredential[]>([]);
  const [config, setConfig] = useState<ProjectVcsConfig>({
    vcsProvider: null,
    vcsRepo: null,
    vcsCredentialId: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([api.listVcsCredentials(), api.getProjectVcs(projectId)])
      .then(([cs, cfg]) => {
        if (!alive) return;
        setCreds(cs);
        setConfig(cfg);
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [projectId]);

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      const next = await api.setProjectVcs(projectId, {
        vcsProvider: config.vcsProvider,
        vcsRepo: config.vcsRepo,
        vcsCredentialId: config.vcsCredentialId,
      });
      setConfig(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function onClear() {
    setSaving(true);
    try {
      const next = await api.setProjectVcs(projectId, {
        vcsProvider: null,
        vcsRepo: null,
        vcsCredentialId: null,
      });
      setConfig(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const filteredCreds = creds.filter((c) => !config.vcsProvider || c.provider === config.vcsProvider);
  const linked = config.vcsProvider !== null && config.vcsRepo !== null && config.vcsCredentialId !== null;

  return (
    <section className="mt-4 rounded-md border border-border-subtle bg-bg-panel/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-secondary">
          <Github size={12} className="text-text-muted" /> VCS feedback
        </h3>
        <button
          type="button"
          onClick={() => setView({ type: 'vcsCredentials' })}
          className="text-[11px] text-text-muted hover:text-accent"
          title="Manage credentials"
        >
          manage…
        </button>
      </div>

      {loading ? (
        <div className="text-[11px] text-text-muted">Loading…</div>
      ) : (
        <div className="space-y-2 text-[11px]">
          <label className="block text-text-secondary">
            <span className="mb-1 block text-text-muted">Provider</span>
            <select
              value={config.vcsProvider ?? ''}
              onChange={(e) =>
                setConfig({
                  ...config,
                  vcsProvider: (e.target.value || null) as VcsProvider | null,
                  vcsCredentialId: null,
                })
              }
              className="w-full rounded-md border border-border-subtle bg-bg-base px-2 py-1 text-text-primary focus:border-accent focus:outline-none"
            >
              <option value="">(none — outbound disabled)</option>
              <option value="github">GitHub</option>
              <option value="gitlab">GitLab</option>
              <option value="gitea">Gitea</option>
            </select>
          </label>

          {config.vcsProvider && (
            <>
              <label className="block text-text-secondary">
                <span className="mb-1 block text-text-muted">Owner/repo</span>
                <input
                  type="text"
                  value={config.vcsRepo ?? ''}
                  onChange={(e) => setConfig({ ...config, vcsRepo: e.target.value || null })}
                  placeholder="alperunlu07/BuildPilot"
                  className="w-full rounded-md border border-border-subtle bg-bg-base px-2 py-1 font-mono text-text-primary focus:border-accent focus:outline-none"
                />
              </label>
              <label className="block text-text-secondary">
                <span className="mb-1 block text-text-muted">Credential</span>
                <select
                  value={config.vcsCredentialId ?? ''}
                  onChange={(e) =>
                    setConfig({ ...config, vcsCredentialId: e.target.value || null })
                  }
                  className="w-full rounded-md border border-border-subtle bg-bg-base px-2 py-1 text-text-primary focus:border-accent focus:outline-none"
                >
                  <option value="">(select a credential)</option>
                  {filteredCreds.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.tokenPreview || '••••'})
                    </option>
                  ))}
                </select>
                {filteredCreds.length === 0 && (
                  <p className="mt-1 text-[10px] text-amber-300">
                    No {config.vcsProvider} credentials. Add one on the VCS page.
                  </p>
                )}
              </label>
            </>
          )}

          {error && <p className="text-rose-400">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            {linked && (
              <button
                type="button"
                onClick={onClear}
                disabled={saving}
                className="rounded-md border border-border-subtle px-2 py-0.5 text-text-secondary hover:border-rose-500 hover:text-rose-300 disabled:opacity-50"
              >
                Unlink
              </button>
            )}
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="rounded-md bg-accent px-2 py-0.5 font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save link'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
