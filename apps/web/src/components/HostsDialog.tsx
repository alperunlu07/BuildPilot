import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { SshHost } from '@buildpilot/shared-types';
import { useStore } from '../store/store';

interface Props {
  open: boolean;
  onClose(): void;
}

interface DraftHost {
  id: string | null;
  name: string;
  host: string;
  identityFile: string;
  password: string;
  skipStrictHostKey: boolean;
  description: string;
}

const EMPTY_DRAFT: DraftHost = {
  id: null,
  name: '',
  host: '',
  identityFile: '',
  password: '',
  skipStrictHostKey: false,
  description: '',
};

export function HostsDialog({ open, onClose }: Props) {
  const hosts = useStore((s) => s.hosts);
  const saveHost = useStore((s) => s.saveHost);
  const updateHost = useStore((s) => s.updateHost);
  const deleteHost = useStore((s) => s.deleteHost);
  const requestConfirmation = useStore((s) => s.requestConfirmation);

  const [draft, setDraft] = useState<DraftHost>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(EMPTY_DRAFT);
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const editing = draft.id !== null;
  const sortedHosts = useMemo(() => hosts, [hosts]);

  if (!open) return null;

  const beginEdit = (h: SshHost) => {
    setDraft({
      id: h.id,
      name: h.name,
      host: h.host,
      identityFile: h.identityFile ?? '',
      password: h.password ?? '',
      skipStrictHostKey: h.skipStrictHostKey ?? false,
      description: h.description ?? '',
    });
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim() || !draft.host.trim()) {
      setError('Name and host are required.');
      return;
    }
    if (!draft.identityFile.trim() && !draft.password) {
      setError('Provide either an identity file or a password.');
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      name: draft.name.trim(),
      host: draft.host.trim(),
      identityFile: draft.identityFile.trim() || null,
      password: draft.password || null,
      skipStrictHostKey: draft.skipStrictHostKey,
      description: draft.description.trim() || null,
    };
    try {
      if (editing && draft.id) await updateHost(draft.id, payload);
      else await saveHost(payload);
      setDraft(EMPTY_DRAFT);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[600px] w-[820px] flex-col rounded-lg border border-slate-700 bg-slate-900 shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Saved SSH hosts</h2>
            <p className="text-[11px] text-slate-500">
              Lives at <code className="text-slate-400">~/.buildpilot/hosts.json</code>. Used by
              Remote SSH, SFTP Upload, TestFlight, Keychain Unlock, and Profile Install steps.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="w-72 shrink-0 overflow-y-auto border-r border-slate-800 p-3">
            <button
              type="button"
              onClick={() => setDraft(EMPTY_DRAFT)}
              className="mb-2 flex w-full items-center gap-2 rounded-md border border-dashed border-slate-700 px-3 py-2 text-xs text-slate-300 hover:border-sky-500 hover:text-sky-400"
            >
              <Plus size={12} /> New host
            </button>
            {sortedHosts.length === 0 && (
              <div className="px-1 py-3 text-xs text-slate-500">
                No saved hosts yet. Fill the form on the right.
              </div>
            )}
            <ul className="space-y-1">
              {sortedHosts.map((h) => {
                const active = draft.id === h.id;
                return (
                  <li key={h.id}>
                    <div
                      className={`group flex items-center gap-2 rounded-md border px-2.5 py-2 text-left ${
                        active
                          ? 'border-sky-500 bg-slate-800/60'
                          : 'border-slate-800 bg-slate-900 hover:border-slate-600'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => beginEdit(h)}
                        className="flex min-w-0 flex-1 flex-col text-left"
                      >
                        <span className="truncate text-xs font-semibold text-slate-100">
                          {h.name}
                        </span>
                        <span className="truncate text-[11px] text-slate-500">{h.host}</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          requestConfirmation({
                            title: `Delete host "${h.name}"?`,
                            body: 'Steps that reference this host by id will fall back to their inline fields, or fail if both are empty.',
                            variant: 'destructive',
                            confirmLabel: 'Delete host',
                            onConfirm: () => deleteHost(h.id),
                          });
                        }}
                        className="rounded p-0.5 text-slate-500 opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100"
                        title="Delete this host"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <form onSubmit={submit} className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-5">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">
              {editing ? 'Edit host' : 'New host'}
            </div>
            <Field label="Name">
              <input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="mac-builder"
                className="hd-input"
              />
            </Field>
            <Field label="Host (user@host[:port])">
              <input
                value={draft.host}
                onChange={(e) => setDraft((d) => ({ ...d, host: e.target.value }))}
                placeholder="build@mac-builder.local:22"
                className="hd-input"
              />
            </Field>
            <Field label="Identity file (use this OR password)">
              <input
                value={draft.identityFile}
                onChange={(e) => setDraft((d) => ({ ...d, identityFile: e.target.value }))}
                placeholder="~/.ssh/id_ed25519"
                className="hd-input"
              />
            </Field>
            <Field label="Password (plaintext — secrets vault TBD)">
              <input
                value={draft.password}
                onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))}
                placeholder="(leave blank to use identity file)"
                className="hd-input"
              />
            </Field>
            <Field label="Description">
              <textarea
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                rows={2}
                placeholder="Optional — what is this host used for?"
                className="hd-input font-mono text-[12px]"
              />
            </Field>
            <label className="flex items-center gap-2 text-[12px] text-slate-300">
              <input
                type="checkbox"
                checked={draft.skipStrictHostKey}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, skipStrictHostKey: e.target.checked }))
                }
                className="h-3.5 w-3.5"
              />
              Skip strict host key checking
            </label>

            {error && (
              <div className="rounded-md border border-rose-800 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
                {error}
              </div>
            )}

            <div className="mt-auto flex justify-end gap-2 pt-2">
              {editing && (
                <button
                  type="button"
                  onClick={() => setDraft(EMPTY_DRAFT)}
                  className="rounded-md px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200"
                >
                  Cancel edit
                </button>
              )}
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-700"
              >
                {busy ? 'Saving…' : editing ? 'Update host' : 'Add host'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <style>{`.hd-input{width:100%;border-radius:.375rem;border:1px solid #334155;background:#020617;padding:.5rem .625rem;font-size:13px;color:#f1f5f9}.hd-input:focus{border-color:#0ea5e9;outline:none}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wider text-slate-500">{label}</span>
      {children}
    </label>
  );
}
