import { useEffect, useMemo, useState } from 'react';
import { Activity, Plus, Server, Trash2, X } from 'lucide-react';
import type { HostCapabilities, SshHost } from '@buildpilot/shared-types';
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
  const pingHost = useStore((s) => s.pingHost);
  const requestConfirmation = useStore((s) => s.requestConfirmation);

  const [draft, setDraft] = useState<DraftHost>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-host transient probe state. Survives between selections; gets
  // wiped only on dialog close.
  const [probing, setProbing] = useState<Record<string, boolean>>({});
  const [probeResult, setProbeResult] = useState<Record<string, { ok: boolean; error?: string }>>({});

  useEffect(() => {
    if (open) {
      setDraft(EMPTY_DRAFT);
      setError(null);
      setBusy(false);
      setProbing({});
      setProbeResult({});
    }
  }, [open]);

  const probeOne = async (id: string) => {
    setProbing((p) => ({ ...p, [id]: true }));
    try {
      const res = await pingHost(id);
      setProbeResult((r) => ({ ...r, [id]: { ok: res.ok, error: res.error } }));
    } catch (err) {
      setProbeResult((r) => ({
        ...r,
        [id]: { ok: false, error: err instanceof Error ? err.message : String(err) },
      }));
    } finally {
      setProbing((p) => ({ ...p, [id]: false }));
    }
  };

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
      className="fixed inset-0 z-[60] flex items-center justify-center bg-bg-base/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[600px] w-[820px] flex-col rounded-lg border border-border-subtle bg-bg-panel shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Saved SSH hosts</h2>
            <p className="text-[11px] text-text-muted">
              Lives at <code className="text-text-muted">~/.buildpilot/hosts.json</code>. Used by
              Remote SSH, SFTP Upload, TestFlight, Keychain Unlock, and Profile Install steps.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="focusable rounded text-text-muted hover:text-text-primary"
            aria-label="Close hosts dialog"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="w-72 shrink-0 overflow-y-auto border-r border-border-subtle p-3">
            <button
              type="button"
              onClick={() => setDraft(EMPTY_DRAFT)}
              className="focusable mb-2 flex w-full items-center gap-2 rounded-md border border-dashed border-border-subtle px-3 py-2 text-xs text-text-secondary hover:border-accent hover:text-accent"
            >
              <Plus size={12} /> New host
            </button>
            {sortedHosts.length === 0 && (
              <div className="rounded-md border border-dashed border-border-subtle bg-bg-panel/60 p-4 text-center">
                <Server className="mx-auto mb-2 text-text-muted" size={22} />
                <div className="text-xs font-medium text-text-primary">No saved hosts</div>
                <p className="mt-1 text-[11px] text-text-muted">
                  Add a host on the right to use it from Remote SSH / SFTP / TestFlight / Mac
                  steps.
                </p>
              </div>
            )}
            <ul className="space-y-1">
              {sortedHosts.map((h) => {
                const active = draft.id === h.id;
                const isProbing = probing[h.id] ?? false;
                const result = probeResult[h.id];
                return (
                  <li key={h.id}>
                    <div
                      className={`group rounded-md border p-2 text-left ${
                        active
                          ? 'border-accent bg-bg-hover/60'
                          : 'border-border-subtle bg-bg-panel hover:border-border'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => beginEdit(h)}
                          className="focusable flex min-w-0 flex-1 flex-col rounded text-left"
                          aria-label={`Edit host ${h.name}`}
                        >
                          <span className="truncate text-xs font-semibold text-text-primary">
                            {h.name}
                          </span>
                          <span className="truncate text-[11px] text-text-muted">{h.host}</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void probeOne(h.id);
                          }}
                          disabled={isProbing}
                          className="focusable rounded p-0.5 text-text-muted hover:text-accent-hover disabled:opacity-50"
                          title="Test SSH connection + read host capabilities"
                          aria-label={`Test connection to ${h.name}`}
                        >
                          <Activity size={12} className={isProbing ? 'motion-safe:animate-pulse' : ''} />
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
                          className="focusable rounded p-0.5 text-text-muted opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100"
                          title="Delete this host"
                          aria-label={`Delete host ${h.name}`}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                      <CapabilityRow caps={h.capabilities} />
                      {result && !result.ok && (
                        <div className="mt-1 truncate text-[10px] text-rose-300" title={result.error}>
                          ✖ {result.error}
                        </div>
                      )}
                      {result && result.ok && (
                        <div className="mt-1 text-[10px] text-emerald-300">✔ reachable</div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <form onSubmit={submit} className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-5">
            <div className="text-[11px] uppercase tracking-wider text-text-muted">
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
            <label className="flex items-center gap-2 text-[12px] text-text-secondary">
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
                  className="focusable rounded-md px-3 py-1.5 text-sm text-text-muted hover:text-text-primary"
                >
                  Cancel edit
                </button>
              )}
              <button
                type="submit"
                disabled={busy}
                className="focusable rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-bg-elevated"
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
      <span className="mb-1 block text-[11px] uppercase tracking-wider text-text-muted">{label}</span>
      {children}
    </label>
  );
}

function CapabilityRow({ caps }: { caps?: HostCapabilities }) {
  if (!caps) return null;
  const ageMins = Math.max(0, Math.round((Date.now() - caps.lastCheckedAt) / 60_000));
  const ageLabel = ageMins < 1 ? 'just now' : ageMins < 60 ? `${ageMins}m ago` : `${Math.round(ageMins / 60)}h ago`;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {caps.xcodeVersion && <Badge color="cyan">{caps.xcodeVersion}</Badge>}
      {caps.macosVersion && <Badge color="violet">macOS {caps.macosVersion}</Badge>}
      {caps.arch && <Badge color="slate">{caps.arch}</Badge>}
      <span className="ml-auto text-[9px] uppercase tracking-wider text-text-muted" title={new Date(caps.lastCheckedAt).toLocaleString()}>
        {ageLabel}
      </span>
    </div>
  );
}

const BADGE_PALETTE: Record<string, string> = {
  cyan: 'bg-cyan-900/40 text-cyan-200 border-cyan-700/50',
  violet: 'bg-violet-900/40 text-violet-200 border-violet-700/50',
  slate: 'bg-bg-elevated text-text-secondary border-border-subtle',
};

function Badge({ color, children }: { color: keyof typeof BADGE_PALETTE | string; children: React.ReactNode }) {
  const cls = BADGE_PALETTE[color] ?? BADGE_PALETTE.slate;
  return <span className={`rounded border px-1.5 py-px text-[10px] font-medium ${cls}`}>{children}</span>;
}
