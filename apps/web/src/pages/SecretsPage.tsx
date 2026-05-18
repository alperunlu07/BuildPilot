import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, KeyRound, Plus, RefreshCcw, Search, Trash2, X } from 'lucide-react';
import type { Secret, SecretUsage } from '@buildpilot/shared-types';
import { api } from '../lib/api';
import { useStore } from '../store/store';
import { cn } from '../lib/cn';
import { Time } from '../lib/formatDate';

// Cluster 11.B item 1+3 — secrets vault page. Table of named secrets with
// create + rotate + delete actions. Selecting a row reveals the "where is
// this used?" panel computed server-side by scanning every pipeline's
// nodes_json for the `${{ secrets.NAME }}` marker.

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

interface CreateDraft {
  name: string;
  value: string;
}

const EMPTY_DRAFT: CreateDraft = { name: '', value: '' };

export function SecretsPage() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const requestConfirmation = useStore((s) => s.requestConfirmation);
  const pushError = useStore((s) => s.pushError);

  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<CreateDraft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Rotate state — name being rotated + new plaintext.
  const [rotating, setRotating] = useState<{ name: string; value: string } | null>(null);
  const [usages, setUsages] = useState<SecretUsage[] | null>(null);
  const [usagesLoading, setUsagesLoading] = useState(false);

  const selectedName = view.type === 'secrets' ? view.name : undefined;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.listSecrets();
      setSecrets(list);
    } catch (err) {
      pushError(`Load secrets failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [pushError]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Load usages whenever a row is selected via the URL.
  useEffect(() => {
    if (!selectedName) {
      setUsages(null);
      return;
    }
    setUsagesLoading(true);
    api
      .secretUsages(selectedName)
      .then((u) => setUsages(u))
      .catch(() => setUsages([]))
      .finally(() => setUsagesLoading(false));
  }, [selectedName]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return secrets;
    return secrets.filter((s) => s.name.toLowerCase().includes(q));
  }, [secrets, filter]);

  async function onCreate() {
    if (busy) return;
    setError(null);
    if (!NAME_RE.test(draft.name)) {
      setError('Name must start with a letter or underscore and contain only A-Z, 0-9, _');
      return;
    }
    if (draft.value.length === 0) {
      setError('Value cannot be empty');
      return;
    }
    setBusy(true);
    try {
      await api.createSecret({ name: draft.name, value: draft.value });
      setDraft(EMPTY_DRAFT);
      setShowCreate(false);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onRotate() {
    if (!rotating || busy) return;
    if (rotating.value.length === 0) {
      setError('New value cannot be empty');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.rotateSecret(rotating.name, rotating.value);
      setRotating(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function onDelete(name: string) {
    requestConfirmation({
      title: `Delete secret "${name}"?`,
      body:
        'This permanently removes the secret. Any pipeline step referencing it ' +
        'will fail to resolve until you create a new one with the same name.',
      variant: 'destructive',
      confirmLabel: 'Delete',
      typedConfirmation: name,
      async onConfirm() {
        try {
          await api.deleteSecret(name);
          if (selectedName === name) setView({ type: 'secrets' });
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
    const text = '${{ secrets.' + name + ' }}';
    navigator.clipboard
      .writeText(text)
      .catch(() => pushError('Could not copy to clipboard'));
  }

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
              <KeyRound size={18} className="text-amber-400" />
              Secrets
            </h2>
            <p className="text-xs text-slate-400">
              Reference in pipeline step fields with{' '}
              <code className="rounded bg-slate-800 px-1 py-0.5 text-[11px] text-slate-200">
                {'${{ secrets.NAME }}'}
              </code>
              . Values are write-only after creation.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setDraft(EMPTY_DRAFT);
              setError(null);
              setShowCreate(true);
            }}
            className="focusable inline-flex items-center gap-1.5 rounded-md border border-sky-500 bg-sky-500/10 px-3 py-1.5 text-sm font-medium text-sky-300 hover:bg-sky-500/20"
          >
            <Plus size={14} /> New secret
          </button>
        </div>

        <div className="mb-3 flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900/40 px-3 py-1.5">
          <Search size={14} className="text-slate-400" />
          <input
            type="text"
            placeholder="Filter by name"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="focusable flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
        </div>

        {loading ? (
          <div className="rounded-md border border-slate-800 bg-slate-900/40 px-4 py-6 text-sm text-slate-400">
            Loading secrets…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-md border border-slate-800 bg-slate-900/40 px-4 py-10 text-center text-sm text-slate-400">
            {secrets.length === 0 ? (
              <>
                No secrets yet. Click <span className="text-slate-200">New secret</span> to
                add one.
              </>
            ) : (
              'No secrets match your filter.'
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/60 text-[11px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Created</th>
                  <th className="px-3 py-2 text-left">Last used</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const active = selectedName === s.name;
                  return (
                    <tr
                      key={s.id}
                      className={cn(
                        'border-t border-slate-800',
                        active ? 'bg-slate-800/60' : 'hover:bg-slate-900/60',
                      )}
                    >
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setView({ type: 'secrets', name: s.name })}
                          className="focusable rounded text-left font-mono text-sky-300 hover:text-sky-200"
                        >
                          {s.name}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-400">
                        <Time ts={s.createdAt} />
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-400">
                        {s.lastUsedAt ? <Time ts={s.lastUsedAt} /> : <span className="text-slate-500">never</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <IconButton
                            label="Copy reference"
                            onClick={() => copyReference(s.name)}
                            icon={<Copy size={13} />}
                          />
                          <IconButton
                            label="Rotate value"
                            onClick={() => {
                              setRotating({ name: s.name, value: '' });
                              setError(null);
                            }}
                            icon={<RefreshCcw size={13} />}
                          />
                          <IconButton
                            label="Delete secret"
                            onClick={() => onDelete(s.name)}
                            icon={<Trash2 size={13} className="text-rose-400" />}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedName && (
        <aside className="hidden w-96 shrink-0 border-l border-slate-800 bg-slate-950 md:flex md:flex-col">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400">
                Where used
              </div>
              <div className="mt-0.5 font-mono text-sm text-sky-300">{selectedName}</div>
            </div>
            <button
              type="button"
              onClick={() => setView({ type: 'secrets' })}
              aria-label="Close usages panel"
              className="focusable rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            >
              <X size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {usagesLoading ? (
              <p className="text-sm text-slate-400">Scanning pipelines…</p>
            ) : !usages || usages.length === 0 ? (
              <p className="text-sm text-slate-400">
                No pipeline step currently references this secret. References are
                detected by scanning for the literal{' '}
                <code className="rounded bg-slate-800 px-1 text-[10px]">
                  {'${{ secrets.' + selectedName + ' }}'}
                </code>{' '}
                marker inside each pipeline's saved node data.
              </p>
            ) : (
              <ul className="space-y-2">
                {usages.map((u, i) => (
                  <li
                    key={`${u.pipelineId}:${u.nodeId}:${u.fieldName}:${i}`}
                    className="rounded-md border border-slate-800 bg-slate-900/40 p-2"
                  >
                    <button
                      type="button"
                      onClick={() => setView({ type: 'pipeline', id: u.pipelineId })}
                      className="focusable block w-full text-left"
                    >
                      <div className="text-sm font-medium text-slate-100">
                        {u.pipelineName}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-400">
                        node <span className="font-mono text-slate-300">{u.nodeId}</span> ·{' '}
                        <span className="font-mono text-emerald-300">{u.nodeType}</span> ·
                        field <span className="font-mono text-amber-300">{u.fieldName}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      )}

      {showCreate && (
        <Modal
          title="New secret"
          onClose={() => setShowCreate(false)}
          footer={
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onCreate}
                disabled={busy}
                className="rounded-md border border-sky-500 bg-sky-500/10 px-3 py-1.5 text-sm font-medium text-sky-300 hover:bg-sky-500/20 disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Create'}
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            <Field label="Name">
              <input
                value={draft.name}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, name: e.target.value.trim() }))
                }
                placeholder="ASC_API_KEY"
                spellCheck={false}
                className="focusable w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-mono text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              />
            </Field>
            <Field label="Value">
              <textarea
                value={draft.value}
                onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))}
                placeholder="paste the secret here"
                rows={5}
                spellCheck={false}
                className="focusable w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-mono text-[12px] text-slate-100 focus:border-sky-500 focus:outline-none"
              />
            </Field>
            {error && <p className="text-sm text-rose-400">{error}</p>}
          </div>
        </Modal>
      )}

      {rotating && (
        <Modal
          title={`Rotate "${rotating.name}"`}
          onClose={() => setRotating(null)}
          footer={
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRotating(null)}
                className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onRotate}
                disabled={busy}
                className="rounded-md border border-amber-500 bg-amber-500/10 px-3 py-1.5 text-sm font-medium text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
              >
                {busy ? 'Rotating…' : 'Rotate'}
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-slate-300">
              The previous value will be overwritten. Pipelines referencing this
              secret will pick up the new value on the next build.
            </p>
            <Field label="New value">
              <textarea
                value={rotating.value}
                onChange={(e) =>
                  setRotating((r) => (r ? { ...r, value: e.target.value } : r))
                }
                rows={5}
                spellCheck={false}
                className="focusable w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-mono text-[12px] text-slate-100 focus:border-sky-500 focus:outline-none"
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
