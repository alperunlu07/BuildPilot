// Cluster 11.D item 2 — Approvals inbox page.
//
// A flat list of every build currently waiting on a decision. Each row shows
// the pipeline name, short build id, message preview, age, approver
// progress, and Approve / Reject quick actions. Clicking the row navigates
// to the build detail page.
//
// Role filtering is soft: when the signed-in user has a role AND the
// approval declares `requiredRoles`, only matching rows are kept. With auth
// disabled (the default in dev), every pending approval is shown.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import type { BuildApproval } from '@buildpilot/shared-types';
import { useStore } from '../store/store';
import { api } from '../lib/api';
import { cn } from '../lib/cn';

// Strip the bare-minimum markdown so the inbox preview reads as plain text.
// We don't render HTML here — just remove the noisy syntax characters.
function stripMarkdown(src: string): string {
  return src
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

function relativeTime(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function ApprovalsInboxPage() {
  const setView = useStore((s) => s.setView);
  const pipelines = useStore((s) => s.pipelines);
  const projects = useStore((s) => s.projects);
  const currentUser = useStore((s) => s.currentUser);
  const [items, setItems] = useState<BuildApproval[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Track which row is currently asking for confirmation; second click fires
  // the actual decision so we don't accidentally approve on a stray click.
  const [pendingDecision, setPendingDecision] = useState<
    { approvalId: string; decision: 'approve' | 'reject' } | null
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await api.listApprovals();
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Cheap polling — the inbox is rarely opened, but when it is we want it to
  // reflect new approvals without a manual refresh. SSE would be tidier but
  // there's no aggregate channel for "any build now needs approval".
  useEffect(() => {
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  const pipelineById = useMemo(() => {
    const m = new Map<string, { name: string; projectId: string }>();
    for (const p of pipelines) m.set(p.id, { name: p.name, projectId: p.projectId });
    return m;
  }, [pipelines]);
  const projectById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projects) m.set(p.id, p.name);
    return m;
  }, [projects]);

  // Soft role filter: when auth is on and the user has a role, hide rows
  // whose requiredRoles excludes that role. Rows without requiredRoles are
  // always shown.
  const visible = useMemo(() => {
    if (!items) return [];
    const role = currentUser?.role;
    if (!role) return items;
    return items.filter(
      (a) => a.requiredRoles.length === 0 || a.requiredRoles.includes(role),
    );
  }, [items, currentUser]);

  async function decide(
    approval: BuildApproval,
    decision: 'approve' | 'reject',
  ) {
    if (
      !pendingDecision ||
      pendingDecision.approvalId !== approval.id ||
      pendingDecision.decision !== decision
    ) {
      setPendingDecision({ approvalId: approval.id, decision });
      return;
    }
    try {
      setBusyId(approval.id);
      setError(null);
      let actor: string | undefined;
      try {
        actor = localStorage.getItem('buildpilot.approval.actor') ?? undefined;
      } catch {
        actor = undefined;
      }
      const updated = await api.decideApproval(approval.buildId, approval.id, {
        decision,
        actor: currentUser?.username ?? actor,
      });
      // If multi-approver flow and we just added one of N, leave the row but
      // refresh; otherwise (settled) drop it.
      if (updated.decision) {
        setItems((cur) => (cur ?? []).filter((a) => a.id !== approval.id));
      } else {
        setItems((cur) =>
          (cur ?? []).map((a) => (a.id === approval.id ? updated : a)),
        );
      }
      setPendingDecision(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-amber-400" />
          <h1 className="text-lg font-semibold text-text-primary">Approvals</h1>
          {visible.length > 0 && (
            <span className="rounded-full bg-amber-900/40 px-2 py-0.5 text-[11px] font-semibold text-amber-200">
              {visible.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="focusable inline-flex items-center gap-1 rounded-md border border-border-subtle px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent-hover disabled:opacity-50"
          aria-label="Refresh"
        >
          <RefreshCw size={12} className={cn(loading && 'animate-spin')} />
          Refresh
        </button>
      </header>
      <p className="text-[12px] text-text-muted">
        Every build currently waiting on a manual approval. Click a row to
        open the build, or use the inline buttons to record a decision.
        {currentUser?.role && (
          <> Showing rows that accept role <code className="rounded bg-bg-elevated px-1">{currentUser.role}</code>.</>
        )}
      </p>

      {error && (
        <div className="rounded-md border border-rose-700/60 bg-rose-950/40 px-3 py-2 text-[12px] text-rose-200">
          {error}
        </div>
      )}

      {items === null ? (
        <div className="text-[12px] text-text-muted">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="rounded-md border border-border-subtle bg-bg-panel/60 px-4 py-8 text-center text-[13px] text-text-muted">
          No approvals waiting. Builds that hit a <code className="rounded bg-bg-elevated px-1">manualApproval</code> step will appear here.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border-subtle">
          <table className="w-full text-left text-[12px]">
            <thead className="bg-bg-panel text-[11px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-3 py-2">Pipeline</th>
                <th className="px-3 py-2">Build</th>
                <th className="px-3 py-2">Message</th>
                <th className="px-3 py-2">Requested</th>
                <th className="px-3 py-2">Approvers</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => {
                const pl = pipelineById.get(a.pipelineId);
                const projectName = pl ? projectById.get(pl.projectId) : null;
                const approvedCount = a.approvers.filter(
                  (x) => x.decision === 'approve',
                ).length;
                const preview = stripMarkdown(a.message);
                const previewShort =
                  preview.length > 80 ? preview.slice(0, 80) + '…' : preview;
                const pending = pendingDecision?.approvalId === a.id;
                const pendingApprove =
                  pending && pendingDecision?.decision === 'approve';
                const pendingReject =
                  pending && pendingDecision?.decision === 'reject';
                return (
                  <tr
                    key={a.id}
                    className="cursor-pointer border-t border-border-subtle hover:bg-bg-panel"
                    onClick={() => setView({ type: 'build', id: a.buildId })}
                  >
                    <td className="px-3 py-2">
                      <div className="font-semibold text-text-primary">
                        {pl?.name ?? <em className="text-text-faint">unknown</em>}
                      </div>
                      {projectName && (
                        <div className="text-[11px] text-text-faint">
                          {projectName}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-text-secondary">
                      {shortId(a.buildId)}
                    </td>
                    <td
                      className="max-w-[320px] truncate px-3 py-2 text-text-primary"
                      title={preview}
                    >
                      {previewShort || <em className="text-text-faint">(no message)</em>}
                    </td>
                    <td
                      className="px-3 py-2 text-text-secondary"
                      title={new Date(a.requestedAt).toLocaleString()}
                    >
                      {relativeTime(a.requestedAt)}
                    </td>
                    <td className="px-3 py-2 text-text-secondary">
                      <span className="font-mono">
                        {approvedCount}/{a.requiredApprovers}
                      </span>
                      {a.requiredRoles.length > 0 && (
                        <span className="ml-2 text-[10px] text-text-faint">
                          {a.requiredRoles.join(',')}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div
                        className="inline-flex gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => void decide(a, 'approve')}
                          disabled={busyId === a.id}
                          className={cn(
                            'focusable inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold',
                            pendingApprove
                              ? 'border-emerald-400 bg-emerald-700/50 text-emerald-50'
                              : 'border-emerald-700 bg-emerald-900/30 text-emerald-200 hover:bg-emerald-800/50',
                            busyId === a.id && 'opacity-50',
                          )}
                          title={pendingApprove ? 'Click again to confirm' : 'Approve'}
                        >
                          <CheckCircle2 size={11} />
                          {pendingApprove ? 'Confirm' : 'Approve'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void decide(a, 'reject')}
                          disabled={busyId === a.id}
                          className={cn(
                            'focusable inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold',
                            pendingReject
                              ? 'border-rose-400 bg-rose-700/50 text-rose-50'
                              : 'border-rose-700 bg-rose-900/30 text-rose-200 hover:bg-rose-800/50',
                            busyId === a.id && 'opacity-50',
                          )}
                          title={pendingReject ? 'Click again to confirm' : 'Reject'}
                        >
                          <XCircle size={11} />
                          {pendingReject ? 'Confirm' : 'Reject'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
