import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  CircleDashed,
  Pencil,
  Plus,
  Server,
  Trash2,
  XCircle,
} from 'lucide-react';
import type { HostCapabilities, SshHost } from '@buildpilot/shared-types';
import { useStore } from '../store/store';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { Time } from '../lib/formatDate';

// Cluster 11.H · Hosts page. Promotes the previous HostsDialog modal to a
// full page at /hosts. The modal is still mounted globally for the
// "manage hosts" command palette quick-action; this page is the canonical
// surface for managing the fleet.

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

// Ping every host periodically so the online pill stays fresh without the
// user manually clicking the activity icon. Long enough that a packed
// fleet doesn't hammer remote SSH endpoints.
const AUTO_PING_INTERVAL_MS = 60_000;

type PingState = { ok: boolean; error?: string; at: number };

export function HostsPage() {
  const hosts = useStore((s) => s.hosts);
  const builds = useStore((s) => s.builds);
  const pipelines = useStore((s) => s.pipelines);
  const saveHost = useStore((s) => s.saveHost);
  const updateHost = useStore((s) => s.updateHost);
  const deleteHost = useStore((s) => s.deleteHost);
  const pingHost = useStore((s) => s.pingHost);
  const requestConfirmation = useStore((s) => s.requestConfirmation);

  const [draft, setDraft] = useState<DraftHost>(EMPTY_DRAFT);
  const [showEditor, setShowEditor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-host transient probe state.
  const [probing, setProbing] = useState<Record<string, boolean>>({});
  const [pingState, setPingState] = useState<Record<string, PingState>>({});
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null);

  // Inflight build counts per host. Computed from current in-flight builds
  // by mapping their pipelineId to the hostIds the pipeline references.
  const inflightByHost = useMemo(() => {
    const inflight = builds.filter((b) => b.status === 'running' || b.status === 'pending');
    const map: Record<string, number> = {};
    for (const b of inflight) {
      const pl = pipelines.find((p) => p.id === b.pipelineId);
      if (!pl) continue;
      const hostIds = new Set<string>();
      for (const n of pl.nodes) {
        const hid = (n.data as Record<string, unknown> | undefined)?.hostId;
        if (typeof hid === 'string' && hid.trim().length > 0) hostIds.add(hid);
      }
      for (const hid of hostIds) map[hid] = (map[hid] ?? 0) + 1;
    }
    return map;
  }, [builds, pipelines]);

  const probeOne = useCallback(
    async (id: string) => {
      setProbing((p) => ({ ...p, [id]: true }));
      try {
        const res = await pingHost(id);
        setPingState((s) => ({
          ...s,
          [id]: { ok: res.ok, error: res.error, at: Date.now() },
        }));
      } catch (err) {
        setPingState((s) => ({
          ...s,
          [id]: {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
            at: Date.now(),
          },
        }));
      } finally {
        setProbing((p) => ({ ...p, [id]: false }));
      }
    },
    [pingHost],
  );

  // Ping on mount (initial fill) and then on an interval. We only probe
  // hosts that haven't already been probed in this page session — the
  // existing capability snapshot in store gives us a starting point.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (didMountRef.current) return;
    didMountRef.current = true;
    for (const h of hosts) void probeOne(h.id);
    // We intentionally only run this on first mount; subsequent host adds
    // trigger their own probe via the form submit path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      for (const h of hosts) void probeOne(h.id);
    }, AUTO_PING_INTERVAL_MS);
    return () => clearInterval(t);
  }, [hosts, probeOne]);

  const beginNew = () => {
    setDraft(EMPTY_DRAFT);
    setError(null);
    setShowEditor(true);
  };

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
    setShowEditor(true);
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
      if (draft.id) await updateHost(draft.id, payload);
      else await saveHost(payload);
      setShowEditor(false);
      setDraft(EMPTY_DRAFT);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const sortedHosts = useMemo(
    () => [...hosts].sort((a, b) => a.name.localeCompare(b.name)),
    [hosts],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between border-b border-border-subtle bg-bg-panel/60 px-5 py-3">
        <div>
          <h1 className="text-base font-semibold text-text-primary">SSH Hosts</h1>
          <p className="text-[11px] text-text-muted">
            Saved hosts at <code className="text-text-muted">~/.buildpilot/hosts.json</code>. Used by
            Remote SSH, SFTP Upload, TestFlight, Keychain Unlock, and Profile Install steps.
          </p>
        </div>
        <button
          type="button"
          onClick={beginNew}
          className="focusable flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
        >
          <Plus size={13} /> Add host
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-5">
          {sortedHosts.length === 0 ? (
            <EmptyState onAdd={beginNew} />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border-subtle">
              <table className="min-w-[760px] w-full text-left text-xs">
                <thead className="bg-bg-panel text-[10px] uppercase tracking-wider text-text-muted">
                  <tr>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Host</th>
                    <th className="px-3 py-2">Capabilities</th>
                    <th className="px-3 py-2">Last seen</th>
                    <th className="px-3 py-2">Inflight</th>
                    <th className="px-3 py-2" title="Concurrent build count, last 24h">Load (24h)</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle bg-bg-base">
                  {sortedHosts.map((h) => {
                    const isSelected = selectedHostId === h.id;
                    const ping = pingState[h.id];
                    const isProbing = probing[h.id] ?? false;
                    const inflight = inflightByHost[h.id] ?? 0;
                    return (
                      <HostRow
                        key={h.id}
                        host={h}
                        selected={isSelected}
                        ping={ping}
                        probing={isProbing}
                        inflight={inflight}
                        onToggleExpand={() =>
                          setSelectedHostId(isSelected ? null : h.id)
                        }
                        onTest={() => void probeOne(h.id)}
                        onEdit={() => beginEdit(h)}
                        onDelete={() =>
                          requestConfirmation({
                            title: `Delete host "${h.name}"?`,
                            body: 'Steps that reference this host by id will fall back to their inline fields, or fail if both are empty.',
                            variant: 'destructive',
                            confirmLabel: 'Delete host',
                            onConfirm: () => deleteHost(h.id),
                          })
                        }
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </main>

        {showEditor && (
          <aside className="flex w-full shrink-0 flex-col border-t border-border-subtle bg-bg-panel/60 md:w-96 md:border-l md:border-t-0">
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-text-muted">
                  {draft.id ? 'Edit host' : 'New host'}
                </div>
                <h2 className="text-sm font-semibold text-text-primary">
                  {draft.id ? draft.name || 'Untitled' : 'Add a new host'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowEditor(false);
                  setDraft(EMPTY_DRAFT);
                  setError(null);
                }}
                className="focusable rounded text-text-muted hover:text-text-primary"
                aria-label="Close editor"
              >
                ×
              </button>
            </div>
            <form
              onSubmit={submit}
              className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
            >
              <Field label="Name">
                <input
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="mac-builder"
                  className="hp-input"
                />
              </Field>
              <Field label="Host (user@host[:port])">
                <input
                  value={draft.host}
                  onChange={(e) => setDraft((d) => ({ ...d, host: e.target.value }))}
                  placeholder="build@mac-builder.local:22"
                  className="hp-input"
                />
              </Field>
              <Field label="Identity file (use this OR password)">
                <input
                  value={draft.identityFile}
                  onChange={(e) => setDraft((d) => ({ ...d, identityFile: e.target.value }))}
                  placeholder="~/.ssh/id_ed25519"
                  className="hp-input"
                />
              </Field>
              <Field label="Password (plaintext — secrets vault TBD)">
                <input
                  value={draft.password}
                  onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))}
                  placeholder="(leave blank to use identity file)"
                  className="hp-input"
                />
              </Field>
              <Field label="Description">
                <textarea
                  value={draft.description}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  rows={3}
                  placeholder="Optional — what is this host used for?"
                  className="hp-input font-mono text-[12px]"
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
                <button
                  type="button"
                  onClick={() => {
                    setShowEditor(false);
                    setDraft(EMPTY_DRAFT);
                    setError(null);
                  }}
                  className="focusable rounded-md px-3 py-1.5 text-sm text-text-muted hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="focusable rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-bg-elevated"
                >
                  {busy ? 'Saving…' : draft.id ? 'Update host' : 'Add host'}
                </button>
              </div>
            </form>
          </aside>
        )}
      </div>

      <style>{`.hp-input{width:100%;border-radius:.375rem;border:1px solid #334155;background:#020617;padding:.5rem .625rem;font-size:13px;color:#f1f5f9}.hp-input:focus{border-color:#0ea5e9;outline:none}`}</style>
    </div>
  );
}

function HostRow({
  host,
  selected,
  ping,
  probing,
  inflight,
  onToggleExpand,
  onTest,
  onEdit,
  onDelete,
}: {
  host: SshHost;
  selected: boolean;
  ping: PingState | undefined;
  probing: boolean;
  inflight: number;
  onToggleExpand(): void;
  onTest(): void;
  onEdit(): void;
  onDelete(): void;
}) {
  const lastSeen = ping?.at ?? host.capabilities?.lastCheckedAt ?? null;
  return (
    <>
      <tr className={cn('text-text-primary', selected && 'bg-bg-panel')}>
        <td className="px-3 py-2">
          <StatusPill probing={probing} ping={ping} hasCaps={!!host.capabilities} />
        </td>
        <td className="px-3 py-2">
          <button
            type="button"
            onClick={onToggleExpand}
            className="focusable rounded text-left font-medium text-text-primary hover:text-accent-hover"
            title="Toggle load chart and recent builds"
          >
            {host.name}
          </button>
          {host.description && (
            <div className="mt-0.5 text-[11px] text-text-muted">{host.description}</div>
          )}
        </td>
        <td className="px-3 py-2 font-mono text-[11px] text-text-secondary">{host.host}</td>
        <td className="px-3 py-2">
          <CapabilityBadges caps={host.capabilities} />
        </td>
        <td className="px-3 py-2 text-[11px] text-text-muted">
          {lastSeen ? <Time ts={lastSeen} /> : <span className="text-text-faint">—</span>}
        </td>
        <td className="px-3 py-2">
          {inflight > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-900/40 px-2 py-0.5 text-[10px] font-medium text-sky-200">
              {inflight} running
            </span>
          ) : (
            <span className="text-[11px] text-text-faint">idle</span>
          )}
        </td>
        <td className="px-3 py-2">
          <HostLoadSpark hostId={host.id} />
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={onTest}
              disabled={probing}
              className="focusable rounded p-1 text-text-muted hover:text-accent-hover disabled:opacity-50"
              title="Test SSH connection + refresh capabilities"
              aria-label={`Test connection to ${host.name}`}
            >
              <Activity size={13} className={probing ? 'motion-safe:animate-pulse' : ''} />
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="focusable rounded p-1 text-text-muted hover:text-accent-hover"
              title="Edit host"
              aria-label={`Edit host ${host.name}`}
            >
              <Pencil size={12} />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="focusable rounded p-1 text-text-muted hover:text-rose-400"
              title="Delete host"
              aria-label={`Delete host ${host.name}`}
            >
              <Trash2 size={12} />
            </button>
          </div>
        </td>
      </tr>
      {selected && (
        <tr>
          <td colSpan={8} className="bg-bg-panel/60 px-3 py-3">
            <HostDetail hostId={host.id} />
          </td>
        </tr>
      )}
    </>
  );
}

function StatusPill({
  probing,
  ping,
  hasCaps,
}: {
  probing: boolean;
  ping: PingState | undefined;
  hasCaps: boolean;
}) {
  if (probing) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-bg-elevated px-2 py-0.5 text-[10px] font-medium text-text-secondary">
        <CircleDashed size={10} className="motion-safe:animate-spin" /> probing
      </span>
    );
  }
  if (ping?.ok) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-900/40 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
        <CheckCircle2 size={10} /> online
      </span>
    );
  }
  if (ping && !ping.ok) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-rose-900/40 px-2 py-0.5 text-[10px] font-medium text-rose-300"
        title={ping.error}
      >
        <XCircle size={10} /> offline
      </span>
    );
  }
  // No probe attempted in this session. If we have a prior capabilities
  // snapshot, treat as "unknown but previously reachable"; otherwise the
  // dot is grey "unknown".
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-bg-elevated px-2 py-0.5 text-[10px] font-medium text-text-muted">
      <CircleDashed size={10} /> {hasCaps ? 'unknown' : 'never probed'}
    </span>
  );
}

function CapabilityBadges({ caps }: { caps?: HostCapabilities }) {
  if (!caps) return <span className="text-[11px] text-text-faint">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {caps.xcodeVersion && <Badge color="cyan">{caps.xcodeVersion}</Badge>}
      {caps.macosVersion && <Badge color="violet">macOS {caps.macosVersion}</Badge>}
      {caps.arch && <Badge color="slate">{caps.arch}</Badge>}
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
  return (
    <span className={`rounded border px-1.5 py-px text-[10px] font-medium ${cls}`}>{children}</span>
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

function EmptyState({ onAdd }: { onAdd(): void }) {
  return (
    <div className="mx-auto mt-12 max-w-md rounded-lg border border-dashed border-border-subtle bg-bg-panel/60 p-8 text-center">
      <Server className="mx-auto mb-3 text-text-muted" size={32} />
      <div className="text-sm font-medium text-text-primary">No saved hosts yet</div>
      <p className="mt-1 text-xs text-text-muted">
        Saved hosts let Remote SSH / SFTP / TestFlight / Mac steps reuse credentials and a
        capability snapshot across pipelines.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="focusable mt-4 inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
      >
        <Plus size={13} /> Add your first host
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Host detail (load chart + recent builds) — Cluster 11.H item 2.
// Renders a small SVG area chart over the last 24h of concurrent build
// counts (server-bucketed). The "no data yet" state covers fresh fleets
// without inventing data.
// ─────────────────────────────────────────────────────────────────────────

function HostDetail({ hostId }: { hostId: string }) {
  const [load, setLoad] = useState<Array<{ t: number; concurrent: number }> | null>(null);
  const [recent, setRecent] = useState<
    Array<{
      id: string;
      pipelineId: string;
      projectId: string;
      status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
      startedAt: number;
      finishedAt: number | null;
    }> | null
  >(null);

  useEffect(() => {
    let alive = true;
    void api
      .hostLoad(hostId, 24)
      .then((r) => {
        if (alive) setLoad(r);
      })
      .catch(() => {
        if (alive) setLoad([]);
      });
    void api
      .listHostBuilds(hostId, 10)
      .then((r) => {
        if (alive) setRecent(r);
      })
      .catch(() => {
        if (alive) setRecent([]);
      });
    return () => {
      alive = false;
    };
  }, [hostId]);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div>
        <div className="mb-2 text-[10px] uppercase tracking-wider text-text-muted">
          Concurrent builds (last 24h)
        </div>
        <LoadChart data={load} />
      </div>
      <div>
        <div className="mb-2 text-[10px] uppercase tracking-wider text-text-muted">
          Recent builds on this host
        </div>
        <RecentBuildsList items={recent} />
      </div>
    </div>
  );
}

// ~80 LOC SVG area chart, à la BuildSparkline. Renders a horizontal x-axis
// (24h) and a polyline area for concurrent build count.
function LoadChart({ data }: { data: Array<{ t: number; concurrent: number }> | null }) {
  if (data === null) {
    return <div className="h-20 animate-pulse rounded bg-bg-panel/60" />;
  }
  const hasAny = data.some((d) => d.concurrent > 0);
  if (data.length === 0 || !hasAny) {
    return (
      <div className="flex h-20 items-center justify-center rounded border border-dashed border-border-subtle bg-bg-panel/60 text-[11px] text-text-faint">
        No data yet — no builds used this host in the last 24h.
      </div>
    );
  }
  const W = 320;
  const H = 80;
  const PAD = 4;
  const maxY = Math.max(1, ...data.map((d) => d.concurrent));
  const xStep = (W - PAD * 2) / Math.max(1, data.length - 1);
  const yScale = (v: number) => H - PAD - (v / maxY) * (H - PAD * 2);
  const points = data.map((d, i) => `${PAD + i * xStep},${yScale(d.concurrent)}`);
  const areaPath = [
    `M${PAD},${H - PAD}`,
    `L${points.join(' L')}`,
    `L${PAD + (data.length - 1) * xStep},${H - PAD}`,
    'Z',
  ].join(' ');
  const linePath = `M${points.join(' L')}`;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-20 w-full"
      role="img"
      aria-label={`Concurrent build chart over 24 hours, peak ${maxY}`}
    >
      <path d={areaPath} fill="rgba(14,165,233,0.18)" />
      <path d={linePath} fill="none" stroke="#0ea5e9" strokeWidth={1.5} />
      <text x={PAD} y={10} fontSize={9} fill="#94a3b8">
        peak {maxY}
      </text>
    </svg>
  );
}

function RecentBuildsList({
  items,
}: {
  items:
    | Array<{
        id: string;
        pipelineId: string;
        projectId: string;
        status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
        startedAt: number;
        finishedAt: number | null;
      }>
    | null;
}) {
  const setView = useStore((s) => s.setView);
  const pipelines = useStore((s) => s.pipelines);
  if (items === null) return <div className="h-20 animate-pulse rounded bg-bg-panel/60" />;
  if (items.length === 0) {
    return (
      <div className="flex h-20 items-center justify-center rounded border border-dashed border-border-subtle bg-bg-panel/60 text-[11px] text-text-faint">
        No builds referenced this host yet.
      </div>
    );
  }
  return (
    <ul className="space-y-1">
      {items.map((b) => {
        const pl = pipelines.find((p) => p.id === b.pipelineId);
        return (
          <li key={b.id}>
            <button
              type="button"
              onClick={() => setView({ type: 'build', id: b.id })}
              className="focusable flex w-full items-center justify-between gap-2 rounded border border-border-subtle bg-bg-base px-2 py-1 text-left text-[11px] text-text-primary hover:border-sky-600"
            >
              <span className="flex items-center gap-2">
                <StatusDot status={b.status} />
                <span className="truncate">{pl?.name ?? `#${b.id.slice(0, 7)}`}</span>
              </span>
              <span className="text-[10px] text-text-muted">
                <Time ts={b.startedAt} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-text-faint',
  running: 'bg-sky-400',
  success: 'bg-emerald-400',
  failed: 'bg-rose-400',
  cancelled: 'bg-amber-400',
};

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn('inline-block h-2 w-2 rounded-full', STATUS_COLOR[status] ?? 'bg-text-faint')}
      title={status}
      aria-label={status}
    />
  );
}

// Inline 80×20 sparkline of concurrent build count over 24h. Sits in the
// hosts table; the larger LoadChart in the expanded detail view shows the
// same data with axes and a "peak N" annotation.
function HostLoadSpark({ hostId }: { hostId: string }) {
  const [data, setData] = useState<Array<{ t: number; concurrent: number }> | null>(null);
  useEffect(() => {
    let alive = true;
    void api
      .hostLoad(hostId, 24)
      .then((r) => {
        if (alive) setData(r);
      })
      .catch(() => {
        if (alive) setData([]);
      });
    return () => {
      alive = false;
    };
  }, [hostId]);
  if (data === null) return <div className="h-5 w-20 animate-pulse rounded bg-bg-panel" />;
  const hasAny = data.some((d) => d.concurrent > 0);
  if (data.length === 0 || !hasAny) {
    return <span className="text-[10px] text-text-faint">no data</span>;
  }
  const W = 80;
  const H = 20;
  const maxY = Math.max(1, ...data.map((d) => d.concurrent));
  const xStep = W / Math.max(1, data.length - 1);
  const yScale = (v: number) => H - 1 - (v / maxY) * (H - 2);
  const points = data.map((d, i) => `${i * xStep},${yScale(d.concurrent)}`);
  const linePath = `M${points.join(' L')}`;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-5 w-20"
      role="img"
      aria-label={`Host load sparkline, peak ${maxY} concurrent`}
    >
      <path d={linePath} fill="none" stroke="#0ea5e9" strokeWidth={1.2} />
    </svg>
  );
}
