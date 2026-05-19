import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Download, FileLock, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import type { VaultFile } from '@buildpilot/shared-types';
import { VAULT_FILE_MAX_BYTES } from '@buildpilot/shared-types';
import { api } from '../lib/api';
import { useStore } from '../store/store';
import { cn } from '../lib/cn';
import { Time } from '../lib/formatDate';

// Cluster 11.B item 2 — file vault page. Lets the user upload a
// .p12/.mobileprovision/.p8/etc once, reference it from any pipeline step
// via the `${{ files.NAME }}` marker, and download/delete from a single
// table. Files are stored encrypted server-side; the upload pathway
// base64-encodes the bytes so they fit through the JSON parser.

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

interface UploadDraft {
  name: string;
  filename: string;
  mime: string;
  contentBase64: string | null;
  rawSize: number;
}

const EMPTY_DRAFT: UploadDraft = {
  name: '',
  filename: '',
  mime: 'application/octet-stream',
  contentBase64: null,
  rawSize: 0,
};

export function VaultFilesPage() {
  const requestConfirmation = useStore((s) => s.requestConfirmation);
  const pushError = useStore((s) => s.pushError);

  const [files, setFiles] = useState<VaultFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [draft, setDraft] = useState<UploadDraft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setFiles(await api.listVaultFiles());
    } catch (err) {
      pushError(
        `Load vault files failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setLoading(false);
    }
  }, [pushError]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return files;
    return files.filter(
      (f) => f.name.toLowerCase().includes(q) || f.filename.toLowerCase().includes(q),
    );
  }, [files, filter]);

  async function readFileIntoDraft(file: File) {
    if (file.size === 0) {
      setError('Selected file is empty');
      return;
    }
    if (file.size > VAULT_FILE_MAX_BYTES) {
      setError(`File exceeds 10 MiB cap (${formatBytes(file.size)})`);
      return;
    }
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const base64 = bytesToBase64(buf);
      const guessedName = file.name
        .replace(/\.[^.]+$/, '')
        .toUpperCase()
        .replace(/[^A-Z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '');
      setDraft((d) => ({
        name: d.name && d.name.length > 0 ? d.name : guessedName,
        filename: file.name,
        mime: file.type || 'application/octet-stream',
        contentBase64: base64,
        rawSize: file.size,
      }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onUpload() {
    if (busy) return;
    setError(null);
    if (!NAME_RE.test(draft.name)) {
      setError('Name must start with a letter or underscore and contain only A-Z, 0-9, _');
      return;
    }
    if (!draft.contentBase64) {
      setError('Pick a file to upload');
      return;
    }
    setBusy(true);
    try {
      await api.uploadVaultFile({
        name: draft.name,
        filename: draft.filename,
        mime: draft.mime,
        contentBase64: draft.contentBase64,
      });
      setShowUpload(false);
      setDraft(EMPTY_DRAFT);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function onDelete(name: string) {
    requestConfirmation({
      title: `Delete vault file "${name}"?`,
      body:
        'This permanently removes the encrypted contents. Any pipeline step ' +
        'referencing it will fail to resolve until you upload a replacement.',
      variant: 'destructive',
      confirmLabel: 'Delete',
      typedConfirmation: name,
      async onConfirm() {
        try {
          await api.deleteVaultFile(name);
          await reload();
        } catch (err) {
          pushError(
            `Delete failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      },
    });
  }

  function copyReference(name: string) {
    const text = '${{ files.' + name + ' }}';
    navigator.clipboard
      .writeText(text)
      .catch(() => pushError('Could not copy to clipboard'));
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
            <FileLock size={18} className="text-emerald-400" />
            File vault
          </h2>
          <p className="text-xs text-slate-400">
            Reference in pipeline step fields with{' '}
            <code className="rounded bg-slate-800 px-1 py-0.5 text-[11px] text-slate-200">
              {'${{ files.NAME }}'}
            </code>
            . Engine extracts a fresh copy to disk per build. Max 10 MiB per file.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setDraft(EMPTY_DRAFT);
            setError(null);
            setShowUpload(true);
          }}
          className="focusable inline-flex items-center gap-1.5 rounded-md border border-sky-500 bg-sky-500/10 px-3 py-1.5 text-sm font-medium text-sky-300 hover:bg-sky-500/20"
        >
          <Plus size={14} /> Upload file
        </button>
      </div>

      <div className="mb-3 flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900/40 px-3 py-1.5">
        <Search size={14} className="text-slate-400" />
        <input
          type="text"
          placeholder="Filter by name or filename"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="focusable flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
        />
      </div>

      {loading ? (
        <div className="rounded-md border border-slate-800 bg-slate-900/40 px-4 py-6 text-sm text-slate-400">
          Loading vault…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-slate-800 bg-slate-900/40 px-4 py-10 text-center text-sm text-slate-400">
          {files.length === 0 ? (
            <>
              No vault files yet. Click <span className="text-slate-200">Upload file</span> to
              add one.
            </>
          ) : (
            'No files match your filter.'
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/60 text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Filename</th>
                <th className="px-3 py-2 text-right">Size</th>
                <th className="px-3 py-2 text-left">Last used</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => (
                <tr key={f.id} className="border-t border-slate-800 hover:bg-slate-900/60">
                  <td className="px-3 py-2 font-mono text-sky-300">{f.name}</td>
                  <td className="px-3 py-2 text-xs text-slate-300">{f.filename}</td>
                  <td className="px-3 py-2 text-right text-xs text-slate-400">
                    {formatBytes(f.sizeBytes)}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-400">
                    {f.lastUsedAt ? <Time ts={f.lastUsedAt} /> : <span className="text-slate-500">never</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex items-center gap-1">
                      <IconButton
                        label="Copy reference"
                        onClick={() => copyReference(f.name)}
                        icon={<Copy size={13} />}
                      />
                      <a
                        href={api.vaultFileDownloadUrl(f.name)}
                        title="Download"
                        aria-label="Download"
                        className="focusable rounded p-1 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                      >
                        <Download size={13} />
                      </a>
                      <IconButton
                        label="Delete vault file"
                        onClick={() => onDelete(f.name)}
                        icon={<Trash2 size={13} className="text-rose-400" />}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showUpload && (
        <Modal
          title="Upload vault file"
          onClose={() => setShowUpload(false)}
          footer={
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowUpload(false)}
                className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onUpload}
                disabled={busy}
                className="rounded-md border border-sky-500 bg-sky-500/10 px-3 py-1.5 text-sm font-medium text-sky-300 hover:bg-sky-500/20 disabled:opacity-50"
              >
                {busy ? 'Uploading…' : 'Upload'}
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={async (e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) await readFileIntoDraft(file);
              }}
              className={cn(
                'block cursor-pointer rounded-md border border-dashed px-4 py-6 text-center text-sm transition-colors',
                dragOver
                  ? 'border-sky-500 bg-sky-500/10 text-sky-100'
                  : 'border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500',
              )}
            >
              <Upload size={20} className="mx-auto mb-1 text-slate-400" />
              <div>
                {draft.filename ? (
                  <span className="font-mono text-slate-200">
                    {draft.filename}{' '}
                    <span className="text-slate-400">
                      ({formatBytes(draft.rawSize)})
                    </span>
                  </span>
                ) : (
                  <>
                    Drag a file here or{' '}
                    <span className="underline">click to browse</span>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) await readFileIntoDraft(file);
                }}
              />
            </label>
            <Field label="Name (used in references)">
              <input
                value={draft.name}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, name: e.target.value.trim() }))
                }
                placeholder="APPLE_DIST_P12"
                spellCheck={false}
                className="focusable w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-mono text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              />
            </Field>
            <Field label="MIME type">
              <input
                value={draft.mime}
                onChange={(e) => setDraft((d) => ({ ...d, mime: e.target.value }))}
                spellCheck={false}
                className="focusable w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              />
            </Field>
            {error && <p className="text-sm text-rose-400">{error}</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  icon,
}: {
  label: string;
  onClick(): void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="focusable rounded p-1 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
    >
      {icon}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wider text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose(): void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-slate-800 bg-slate-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="focusable rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            <X size={14} />
          </button>
        </div>
        <div className="px-4 py-3">{children}</div>
        {footer && <div className="border-t border-slate-800 px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
