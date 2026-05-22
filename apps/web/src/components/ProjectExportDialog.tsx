import { useState } from 'react';
import { Download, X } from 'lucide-react';
import type { Project, ProjectExportManifest, ProjectBundleEnvelope } from '@buildpilot/shared-types';
import { api } from '../lib/api';
import { Dialog } from './ui/Dialog';

interface Props {
  project: Project | null;
  open: boolean;
  onClose(): void;
}

interface BuiltBundle {
  envelope: ProjectBundleEnvelope;
  manifest: ProjectExportManifest;
}

// Cluster 12 — encrypted project export. The dialog asks for a passphrase,
// posts to /api/projects/:id/export, and offers the user the resulting JSON
// envelope as a download. The envelope is opaque ciphertext; only the
// matching import flow + passphrase can read it back.
export function ProjectExportDialog({ project, open, onClose }: Props) {
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [built, setBuilt] = useState<BuiltBundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset(): void {
    setPassphrase('');
    setConfirm('');
    setBuilt(null);
    setError(null);
    setBusy(false);
  }

  function close(): void {
    reset();
    onClose();
  }

  async function onBuild(): Promise<void> {
    if (!project) return;
    setError(null);
    if (passphrase.length < 8) {
      setError('Passphrase must be at least 8 characters.');
      return;
    }
    if (passphrase !== confirm) {
      setError('Passphrase and confirmation do not match.');
      return;
    }
    setBusy(true);
    try {
      const result = await api.exportProject(project.id, passphrase);
      setBuilt(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function download(): void {
    if (!built || !project) return;
    const blob = new Blob([JSON.stringify(built.envelope, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = project.name.replace(/[^A-Za-z0-9_-]+/g, '_');
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    a.href = url;
    a.download = `buildpilot-project-${safeName}-${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!project) return null;

  return (
    <Dialog
      open={open}
      onClose={close}
      ariaLabel={`Export project ${project.name}`}
      size="md"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-text-primary">
          Export project · {project.name}
        </h2>
        <button
          type="button"
          onClick={close}
          className="focusable rounded text-text-muted hover:text-text-primary"
          aria-label="Close export dialog"
        >
          <X size={16} />
        </button>
      </div>

      {!built ? (
        <>
          <p className="mb-3 text-[12px] text-text-muted">
            Builds an AES-256-GCM encrypted JSON bundle containing this project,
            all of its pipelines, and every secret / vault file / host / VCS
            credential referenced by them. Restore on another machine with the
            same passphrase via Projects → Import.
          </p>
          <div className="mb-3 rounded-md border border-amber-700/40 bg-amber-950/20 px-3 py-2 text-[11px] text-amber-200">
            <strong>Warning:</strong> the bundle contains plaintext secret
            values (encrypted only at the bundle envelope). Store and transfer
            it as if it were the secrets themselves.
          </div>

          <label className="mb-3 block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-text-muted">
              Passphrase (≥ 8 chars)
            </span>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              autoComplete="new-password"
              data-autofocus
              className="focusable w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
          </label>
          <label className="mb-4 block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-text-muted">
              Confirm passphrase
            </span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="focusable w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
          </label>

          {error && (
            <div className="mb-3 rounded-md border border-rose-800 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="focusable rounded-md px-3 py-1.5 text-sm text-text-muted hover:text-text-primary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onBuild}
              disabled={busy || passphrase.length < 8 || passphrase !== confirm}
              className="focusable rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-bg-elevated"
            >
              {busy ? 'Building…' : 'Build bundle'}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-3 text-[12px] text-text-muted">
            Bundle built. Download the JSON file below and store it somewhere
            the receiving machine can read. Re-import via Projects → Import on
            the target machine with the same passphrase.
          </p>
          <div className="mb-3 rounded-md border border-border-subtle bg-bg-panel/60 px-3 py-2 text-[12px] text-text-secondary">
            <div className="font-medium text-text-primary">Manifest</div>
            <ul className="ml-3 mt-1 list-disc text-text-muted">
              <li>{built.manifest.pipelines} pipeline{built.manifest.pipelines === 1 ? '' : 's'}</li>
              <li>{built.manifest.secrets} secret{built.manifest.secrets === 1 ? '' : 's'}</li>
              <li>{built.manifest.vaultFiles} vault file{built.manifest.vaultFiles === 1 ? '' : 's'}</li>
              <li>{built.manifest.hosts} host{built.manifest.hosts === 1 ? '' : 's'}</li>
              <li>{built.manifest.vcsCredentials} VCS credential{built.manifest.vcsCredentials === 1 ? '' : 's'}</li>
            </ul>
            {built.manifest.missingReferences.length > 0 && (
              <div className="mt-2 rounded border border-amber-700/40 bg-amber-950/20 px-2 py-1.5 text-[11px] text-amber-200">
                <div className="font-medium">Missing references ({built.manifest.missingReferences.length}):</div>
                <ul className="ml-3 list-disc">
                  {built.manifest.missingReferences.map((r, i) => (
                    <li key={i} className="font-mono">{r}</li>
                  ))}
                </ul>
                <p className="mt-1">
                  The bundle was created without these values — fill them in
                  manually after import or before the next build.
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="focusable rounded-md px-3 py-1.5 text-sm text-text-muted hover:text-text-primary"
            >
              Done
            </button>
            <button
              type="button"
              onClick={download}
              className="focusable inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
            >
              <Download size={14} /> Download .json
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
