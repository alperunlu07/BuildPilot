import { useState } from 'react';
import { ChevronDown, ChevronRight, Download, Upload } from 'lucide-react';
import { api } from '../lib/api';
import { useStore } from '../store/store';
import {
  buildExportBundle,
  parseImportBundle,
  type ImportConflictPolicy,
  type ImportSummary,
} from '../lib/secretsBundle';

// Cluster 11.B item 4 — encrypted bundle import/export. The bundle is a
// JSON envelope that the browser encrypts with a user-supplied passphrase
// via WebCrypto (PBKDF2 → AES-GCM). Bundles roundtrip the secrets table
// plus a manifest of vault files (with inline base64 contents when each
// file is under 1 MiB — larger files are exported separately so the
// bundle stays small).

const SMALL_FILE_INLINE_CAP = 1 * 1024 * 1024;

export function ImportExportPanel({ onChanged }: { onChanged(): void | Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [exportPass, setExportPass] = useState('');
  const [importPass, setImportPass] = useState('');
  const [importBlob, setImportBlob] = useState('');
  const [conflictPolicy, setConflictPolicy] = useState<ImportConflictPolicy>('skip');
  const [exportText, setExportText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const pushError = useStore((s) => s.pushError);

  async function onExport() {
    if (exportBusy) return;
    setError(null);
    if (exportPass.length < 8) {
      setError('Passphrase must be at least 8 characters');
      return;
    }
    setExportBusy(true);
    try {
      const [secrets, vaultFiles] = await Promise.all([
        api.listSecrets(),
        api.listVaultFiles(),
      ]);
      // Server intentionally never exposes plaintext secrets, so the
      // exported bundle records only the names + metadata for that
      // table. The user must re-supply the values when importing — see
      // the panel copy below for what import actually merges.
      // Vault files <1 MiB include base64 inline; larger ones list the
      // metadata so the user knows what's outside the bundle.
      const fileEntries = await Promise.all(
        vaultFiles.map(async (vf) => {
          if (vf.sizeBytes <= SMALL_FILE_INLINE_CAP) {
            const url = api.vaultFileDownloadUrl(vf.name);
            const res = await fetch(url);
            const buf = new Uint8Array(await res.arrayBuffer());
            return {
              ...vf,
              contentBase64: bytesToBase64(buf),
            } as const;
          }
          return { ...vf, contentBase64: null } as const;
        }),
      );
      const bundle = await buildExportBundle(
        {
          secrets,
          files: fileEntries,
        },
        exportPass,
      );
      setExportText(bundle);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExportBusy(false);
    }
  }

  async function onImport() {
    if (importBusy) return;
    setError(null);
    setSummary(null);
    if (importPass.length === 0 || importBlob.trim().length === 0) {
      setError('Both the bundle and the passphrase are required');
      return;
    }
    setImportBusy(true);
    try {
      const parsed = await parseImportBundle(importBlob.trim(), importPass);
      const result: ImportSummary = {
        secretsImported: 0,
        secretsSkipped: 0,
        secretsRenamed: 0,
        filesImported: 0,
        filesSkipped: 0,
        filesRenamed: 0,
        errors: [],
      };
      // Re-fetch the live name sets so we don't accidentally trample
      // freshly added entries.
      const [liveSecrets, liveFiles] = await Promise.all([
        api.listSecrets(),
        api.listVaultFiles(),
      ]);
      const secretNames = new Set(liveSecrets.map((s) => s.name));
      const fileNames = new Set(liveFiles.map((f) => f.name));

      for (const sec of parsed.secrets) {
        if (!sec.plaintextProvided) {
          result.secretsSkipped += 1;
          continue;
        }
        let target = sec.name;
        if (secretNames.has(target)) {
          if (conflictPolicy === 'skip') {
            result.secretsSkipped += 1;
            continue;
          }
          target = nextAvailableName(target, secretNames);
          result.secretsRenamed += 1;
        }
        try {
          await api.createSecret({ name: target, value: sec.value! });
          secretNames.add(target);
          result.secretsImported += 1;
        } catch (err) {
          result.errors.push(
            `secret ${sec.name}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      for (const file of parsed.files) {
        if (!file.contentBase64) {
          result.filesSkipped += 1;
          continue;
        }
        let target = file.name;
        if (fileNames.has(target)) {
          if (conflictPolicy === 'skip') {
            result.filesSkipped += 1;
            continue;
          }
          target = nextAvailableName(target, fileNames);
          result.filesRenamed += 1;
        }
        try {
          await api.uploadVaultFile({
            name: target,
            filename: file.filename,
            mime: file.mime,
            contentBase64: file.contentBase64,
          });
          fileNames.add(target);
          result.filesImported += 1;
        } catch (err) {
          result.errors.push(
            `file ${file.name}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      setSummary(result);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImportBusy(false);
    }
  }

  function downloadBundle() {
    if (!exportText) return;
    try {
      const blob = new Blob([exportText], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `buildpilot-vault-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      pushError(`Download failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <div className="mb-3 rounded-md border border-border-subtle bg-bg-panel/60">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="focusable flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-secondary hover:bg-bg-panel"
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        Import / export encrypted bundle
      </button>
      {expanded && (
        <div className="border-t border-border-subtle px-3 py-3 text-sm text-text-secondary">
          <p className="mb-3 text-xs text-text-muted">
            Bundles roundtrip the secrets <em>name list</em> + the vault file
            contents (files under 1 MiB include base64 inline). Because the server
            never exposes plaintext secrets, the user has to fill in each value
            in the bundle before re-importing. Files under 1 MiB import in full.
          </p>

          {/* Export */}
          <div className="mb-4 rounded border border-border-subtle bg-bg-panel p-3">
            <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wider text-emerald-400">
              <Download size={12} /> Export
            </div>
            <input
              type="password"
              value={exportPass}
              onChange={(e) => setExportPass(e.target.value)}
              placeholder="Bundle passphrase (≥ 8 chars)"
              className="focusable mb-2 w-full rounded-md border border-border-subtle bg-bg-panel px-2.5 py-1.5 text-[13px] text-text-primary focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={onExport}
              disabled={exportBusy}
              className="rounded-md border border-emerald-500 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
            >
              {exportBusy ? 'Encrypting…' : 'Build bundle'}
            </button>
            {exportText && (
              <div className="mt-3 space-y-2">
                <textarea
                  readOnly
                  value={exportText}
                  rows={5}
                  className="w-full rounded-md border border-border-subtle bg-bg-panel px-2 py-1.5 font-mono text-[11px] text-text-primary"
                />
                <button
                  type="button"
                  onClick={downloadBundle}
                  className="rounded-md border border-border-subtle px-3 py-1 text-xs text-text-primary hover:bg-bg-elevated"
                >
                  Download as .json
                </button>
              </div>
            )}
          </div>

          {/* Import */}
          <div className="rounded border border-border-subtle bg-bg-panel p-3">
            <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wider text-accent">
              <Upload size={12} /> Import
            </div>
            <textarea
              value={importBlob}
              onChange={(e) => setImportBlob(e.target.value)}
              placeholder="Paste encrypted bundle JSON here"
              rows={4}
              spellCheck={false}
              className="focusable mb-2 w-full rounded-md border border-border-subtle bg-bg-panel px-2.5 py-1.5 font-mono text-[11px] text-text-primary focus:border-accent focus:outline-none"
            />
            <input
              type="password"
              value={importPass}
              onChange={(e) => setImportPass(e.target.value)}
              placeholder="Bundle passphrase"
              className="focusable mb-2 w-full rounded-md border border-border-subtle bg-bg-panel px-2.5 py-1.5 text-[13px] text-text-primary focus:border-accent focus:outline-none"
            />
            <div className="mb-2 flex items-center gap-3 text-xs text-text-secondary">
              <span>On name conflict:</span>
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  checked={conflictPolicy === 'skip'}
                  onChange={() => setConflictPolicy('skip')}
                />
                skip
              </label>
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  checked={conflictPolicy === 'rename'}
                  onChange={() => setConflictPolicy('rename')}
                />
                rename (suffix _2, _3…)
              </label>
            </div>
            <button
              type="button"
              onClick={onImport}
              disabled={importBusy}
              className="rounded-md border border-accent bg-sky-500/10 px-3 py-1 text-xs font-medium text-accent-hover hover:bg-accent-hover/20 disabled:opacity-50"
            >
              {importBusy ? 'Importing…' : 'Decrypt + import'}
            </button>
            {summary && (
              <div className="mt-3 rounded border border-border-subtle bg-bg-panel/60 px-3 py-2 text-[11px] text-text-secondary">
                <div>
                  Secrets — imported {summary.secretsImported}, skipped{' '}
                  {summary.secretsSkipped}, renamed {summary.secretsRenamed}
                </div>
                <div>
                  Files — imported {summary.filesImported}, skipped{' '}
                  {summary.filesSkipped}, renamed {summary.filesRenamed}
                </div>
                {summary.errors.length > 0 && (
                  <details className="mt-1 text-rose-300">
                    <summary>Errors ({summary.errors.length})</summary>
                    <ul className="ml-3 list-disc">
                      {summary.errors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>

          {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
        </div>
      )}
    </div>
  );
}

function nextAvailableName(base: string, taken: Set<string>): string {
  let i = 2;
  let candidate = `${base}_${i}`;
  while (taken.has(candidate)) {
    i += 1;
    candidate = `${base}_${i}`;
  }
  return candidate;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
