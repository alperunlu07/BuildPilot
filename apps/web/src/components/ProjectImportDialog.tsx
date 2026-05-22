import { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import type {
  ProjectBundleEnvelope,
  ProjectImportOptions,
  ProjectImportSummary,
} from '@buildpilot/shared-types';
import { api } from '../lib/api';
import { Dialog } from './ui/Dialog';

interface Props {
  open: boolean;
  onClose(): void;
  onImported(summary: ProjectImportSummary): void;
}

// Cluster 12 — restore a project bundle on this machine. The user pastes
// the encrypted envelope (or uploads the .json file), supplies the matching
// passphrase, and picks the conflict policy for each kind of referenced
// resource. The server decrypts, applies the policies, and creates fresh
// rows in this machine's database.
export function ProjectImportDialog({ open, onClose, onImported }: Props) {
  const [bundleText, setBundleText] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [pathOverride, setPathOverride] = useState('');
  const [policyProject, setPolicyProject] = useState<'rename' | 'replace'>('rename');
  const [policySecrets, setPolicySecrets] = useState<'skip' | 'rename' | 'overwrite'>('skip');
  const [policyFiles, setPolicyFiles] = useState<'skip' | 'rename' | 'overwrite'>('skip');
  const [policyHosts, setPolicyHosts] = useState<'new' | 'merge'>('merge');
  const [policyCreds, setPolicyCreds] = useState<'new' | 'merge'>('merge');
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ProjectImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function reset(): void {
    setBundleText('');
    setPassphrase('');
    setPathOverride('');
    setSummary(null);
    setError(null);
    setBusy(false);
  }

  function close(): void {
    reset();
    onClose();
  }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setBundleText(text.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      // Reset so picking the same file again still fires `change`.
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function onImport(): Promise<void> {
    setError(null);
    if (!bundleText.trim()) {
      setError('Paste the bundle JSON or upload the .json file.');
      return;
    }
    if (!passphrase) {
      setError('Passphrase is required.');
      return;
    }
    let envelope: ProjectBundleEnvelope;
    try {
      envelope = JSON.parse(bundleText) as ProjectBundleEnvelope;
    } catch {
      setError('Bundle is not valid JSON.');
      return;
    }
    if (envelope?.kind !== 'buildpilot-project-bundle' || envelope.version !== 1) {
      setError('Not a BuildPilot project bundle (or unsupported version).');
      return;
    }
    setBusy(true);
    try {
      const options: ProjectImportOptions = {
        pathOverride: pathOverride.trim() || null,
        conflictPolicy: {
          project: policyProject,
          secrets: policySecrets,
          vaultFiles: policyFiles,
          hosts: policyHosts,
          vcsCredentials: policyCreds,
        },
      };
      const result = await api.importProject({ envelope, passphrase, options });
      setSummary(result);
      onImported(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={close} ariaLabel="Import project" size="md">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-text-primary">Import project</h2>
        <button
          type="button"
          onClick={close}
          className="focusable rounded text-text-muted hover:text-text-primary"
          aria-label="Close import dialog"
        >
          <X size={16} />
        </button>
      </div>

      {!summary ? (
        <>
          <p className="mb-3 text-[12px] text-text-muted">
            Restore a project + all its referenced secrets, vault files, hosts,
            and VCS credentials from a bundle exported on another machine.
          </p>

          <label className="mb-3 block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-text-muted">
              Bundle JSON
            </span>
            <textarea
              value={bundleText}
              onChange={(e) => setBundleText(e.target.value)}
              placeholder="Paste the .json envelope here…"
              rows={4}
              spellCheck={false}
              data-autofocus
              className="focusable w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 font-mono text-[11px] text-text-primary focus:border-accent focus:outline-none"
            />
            <div className="mt-1.5 flex items-center gap-2 text-[11px] text-text-muted">
              <span>or</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={onFileChosen}
                className="text-text-secondary file:mr-2 file:rounded-md file:border-0 file:bg-bg-elevated file:px-2 file:py-1 file:text-text-primary"
              />
            </div>
          </label>

          <label className="mb-3 block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-text-muted">
              Passphrase
            </span>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              autoComplete="off"
              className="focusable w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
          </label>

          <label className="mb-3 block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-text-muted">
              Project path override (optional)
            </span>
            <input
              type="text"
              value={pathOverride}
              onChange={(e) => setPathOverride(e.target.value)}
              placeholder="Leave blank to use the original path"
              spellCheck={false}
              className="focusable w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 font-mono text-[12px] text-text-primary focus:border-accent focus:outline-none"
            />
          </label>

          <details className="mb-3 rounded-md border border-border-subtle bg-bg-panel/40 px-3 py-2">
            <summary className="cursor-pointer text-[12px] text-text-secondary">
              Conflict policy
            </summary>
            <div className="mt-2 space-y-2 text-[12px] text-text-secondary">
              <ConflictRow label="Project name" value={policyProject} onChange={(v) => setPolicyProject(v as 'rename' | 'replace')} options={[['rename', 'Rename'], ['replace', 'Replace existing']]} />
              <ConflictRow label="Secrets" value={policySecrets} onChange={(v) => setPolicySecrets(v as 'skip' | 'rename' | 'overwrite')} options={[['skip', 'Skip'], ['rename', 'Rename'], ['overwrite', 'Overwrite']]} />
              <ConflictRow label="Vault files" value={policyFiles} onChange={(v) => setPolicyFiles(v as 'skip' | 'rename' | 'overwrite')} options={[['skip', 'Skip'], ['rename', 'Rename'], ['overwrite', 'Overwrite']]} />
              <ConflictRow label="Hosts" value={policyHosts} onChange={(v) => setPolicyHosts(v as 'new' | 'merge')} options={[['merge', 'Merge if same name+host'], ['new', 'Always create new']]} />
              <ConflictRow label="VCS credentials" value={policyCreds} onChange={(v) => setPolicyCreds(v as 'new' | 'merge')} options={[['merge', 'Merge if same name+provider'], ['new', 'Always create new']]} />
            </div>
          </details>

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
              onClick={onImport}
              disabled={busy || !bundleText.trim() || !passphrase}
              className="focusable inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-bg-elevated"
            >
              <Upload size={14} /> {busy ? 'Importing…' : 'Decrypt + import'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="mb-3 rounded-md border border-border-subtle bg-bg-panel/60 px-3 py-2 text-[12px] text-text-secondary">
            <div className="text-text-primary font-medium">
              Imported as <span className="font-mono">{summary.projectName}</span>
            </div>
            <ul className="ml-3 mt-1 list-disc text-text-muted">
              <li>{summary.pipelinesCreated} pipeline{summary.pipelinesCreated === 1 ? '' : 's'} created</li>
              <li>Secrets — {summary.secretsImported} imported, {summary.secretsSkipped} skipped, {summary.secretsRenamed} renamed</li>
              <li>Vault files — {summary.filesImported} imported, {summary.filesSkipped} skipped, {summary.filesRenamed} renamed</li>
              <li>Hosts — {summary.hostsCreated} created, {summary.hostsMerged} merged</li>
              <li>VCS credentials — {summary.vcsCredentialsCreated} created, {summary.vcsCredentialsMerged} merged</li>
            </ul>
            {summary.errors.length > 0 && (
              <details className="mt-2 text-rose-300">
                <summary>Errors ({summary.errors.length})</summary>
                <ul className="ml-3 list-disc">
                  {summary.errors.map((e, i) => (
                    <li key={i} className="font-mono text-[11px]">{e}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={close}
              className="focusable rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
            >
              Done
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}

function ConflictRow({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange(v: string): void;
  options: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="min-w-[110px] text-text-muted">{label}</span>
      {options.map(([v, lbl]) => (
        <label key={v} className="inline-flex items-center gap-1">
          <input
            type="radio"
            checked={value === v}
            onChange={() => onChange(v)}
          />
          {lbl}
        </label>
      ))}
    </div>
  );
}
