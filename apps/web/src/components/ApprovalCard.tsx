// Cluster 11.D — ApprovalCard
//
// Renders the active approval at the top of BuildDetailPage when the build
// is awaiting a decision. Displays the markdown message, optional inputs,
// and Approve / Reject buttons. Multi-approver flows show progress
// ("1/2 approvals collected") and the actor list.

import { useMemo, useState } from 'react';
import { CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import type { BuildApproval } from '@buildpilot/shared-types';
import { api } from '../lib/api';

interface Props {
  approval: BuildApproval;
  onDecided?(updated: BuildApproval): void;
  // When true, the form is read-only — used by inline previews / settled
  // approvals where we want to show the audit trail without action buttons.
  readOnly?: boolean;
}

// Minimal markdown renderer — bold / italic / inline code / line breaks +
// headings. The full message is escaped first so we never inject raw HTML.
// Kept inline to avoid pulling in a 50 KB dependency for one card.
function renderMarkdown(src: string): string {
  const esc = src
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return esc
    .replace(/^### (.+)$/gm, '<h3 class="mt-2 text-sm font-semibold text-slate-100">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="mt-2 text-base font-semibold text-slate-100">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="mt-2 text-lg font-semibold text-slate-100">$1</h1>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="rounded bg-slate-800 px-1 py-0.5 text-[11px]">$1</code>')
    .replace(/\n/g, '<br />');
}

export function ApprovalCard({ approval, onDecided, readOnly = false }: Props) {
  const initialValues = useMemo(() => {
    const v: Record<string, string | boolean> = {};
    for (const spec of approval.inputsSpec) {
      v[spec.name] = spec.type === 'checkbox' ? false : '';
    }
    return v;
  }, [approval]);
  const [values, setValues] = useState<Record<string, string | boolean>>(initialValues);
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actor, setActor] = useState<string>(() => {
    try {
      return localStorage.getItem('buildpilot.approval.actor') ?? '';
    } catch {
      return '';
    }
  });

  const settled = approval.decision !== null;
  const approvedCount = approval.approvers.filter((a) => a.decision === 'approve').length;
  const rejectedCount = approval.approvers.filter((a) => a.decision === 'reject').length;
  const showActions = !settled && !readOnly;
  const multiApprover = approval.requiredApprovers > 1;
  const remaining = Math.max(0, approval.requiredApprovers - approvedCount);

  async function decide(decision: 'approve' | 'reject') {
    if (decision === 'approve') {
      for (const spec of approval.inputsSpec) {
        if (!spec.required) continue;
        const v = values[spec.name];
        if (spec.type === 'checkbox') {
          if (v !== true) {
            setError(`Please tick "${spec.label}"`);
            return;
          }
        } else if (typeof v !== 'string' || v.trim().length === 0) {
          setError(`Please fill in "${spec.label}"`);
          return;
        }
      }
    }
    try {
      setBusy(decision);
      setError(null);
      try {
        if (actor) localStorage.setItem('buildpilot.approval.actor', actor);
      } catch {
        /* ignore */
      }
      const updated = await api.decideApproval(approval.buildId, approval.id, {
        decision,
        inputValues: values,
        actor: actor.trim().length > 0 ? actor.trim() : undefined,
      });
      onDecided?.(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      className="border-b border-amber-700/40 bg-amber-950/30 px-3 py-3 sm:px-6"
      aria-label="Manual approval required"
    >
      <header className="mb-2 flex flex-wrap items-center gap-2">
        <ShieldCheck size={14} className="text-amber-400" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">
          {settled
            ? `Manual approval · ${approval.decision}`
            : multiApprover
              ? `Awaiting approval (${approvedCount} of ${approval.requiredApprovers} received)`
              : 'Manual approval required'}
        </span>
        {approval.requiredRoles.length > 0 && (
          <span className="text-[11px] text-amber-300">
            roles: {approval.requiredRoles.join(', ')}
          </span>
        )}
        {approval.timeoutMinutes > 0 && (
          <span className="text-[11px] text-amber-300">
            timeout: {approval.timeoutMinutes}m
          </span>
        )}
      </header>

      {!settled && multiApprover && (
        <div className="mb-3 rounded-md border border-amber-700/40 bg-amber-950/40 px-2.5 py-1.5 text-[11px] text-amber-100">
          {remaining > 0 ? (
            <>
              {remaining} more approval{remaining === 1 ? '' : 's'} needed before
              this step can resume.
            </>
          ) : (
            <>All required approvals collected — finalising…</>
          )}
          {rejectedCount > 0 && (
            <span className="ml-1 text-rose-300">
              {' '}
              ({rejectedCount} reject{rejectedCount === 1 ? '' : 's'} received — any reject finalises the step)
            </span>
          )}
          {approval.requiredRoles.length > 0 && (
            <div className="mt-1 text-[10px] text-amber-300/80">
              Eligible reviewers: anyone with role{' '}
              {approval.requiredRoles.map((r) => (
                <code
                  key={r}
                  className="rounded bg-amber-900/50 px-1 py-0.5 font-mono text-[10px]"
                >
                  {r}
                </code>
              ))}{' '}
              (soft hint — out-of-role decisions are allowed but logged).
            </div>
          )}
        </div>
      )}

      <div
        className="prose prose-invert mb-3 max-w-none text-sm leading-relaxed text-slate-100"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(approval.message) }}
      />

      {approval.inputsSpec.length > 0 && (
        <div className="mb-3 space-y-2">
          {approval.inputsSpec.map((spec) => {
            const v = values[spec.name];
            if (spec.type === 'checkbox') {
              return (
                <label
                  key={spec.name}
                  className="flex items-center gap-2 text-[12px] text-slate-200"
                >
                  <input
                    type="checkbox"
                    checked={v === true}
                    disabled={!showActions}
                    onChange={(e) =>
                      setValues((cur) => ({ ...cur, [spec.name]: e.target.checked }))
                    }
                  />
                  {spec.label}
                  {spec.required && <span className="text-amber-300">*</span>}
                </label>
              );
            }
            if (spec.type === 'select') {
              return (
                <label key={spec.name} className="block text-[12px] text-slate-200">
                  <span className="mb-1 block">
                    {spec.label}
                    {spec.required && <span className="text-amber-300"> *</span>}
                  </span>
                  <select
                    value={typeof v === 'string' ? v : ''}
                    disabled={!showActions}
                    onChange={(e) =>
                      setValues((cur) => ({ ...cur, [spec.name]: e.target.value }))
                    }
                    className="focusable w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100 focus:border-sky-500 focus:outline-none"
                  >
                    <option value="">— select —</option>
                    {(spec.options ?? []).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </label>
              );
            }
            return (
              <label key={spec.name} className="block text-[12px] text-slate-200">
                <span className="mb-1 block">
                  {spec.label}
                  {spec.required && <span className="text-amber-300"> *</span>}
                </span>
                <input
                  type="text"
                  value={typeof v === 'string' ? v : ''}
                  disabled={!showActions}
                  onChange={(e) =>
                    setValues((cur) => ({ ...cur, [spec.name]: e.target.value }))
                  }
                  className="focusable w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100 focus:border-sky-500 focus:outline-none"
                />
              </label>
            );
          })}
        </div>
      )}

      {showActions && (
        <div className="mb-2">
          <label className="block text-[11px] uppercase tracking-wider text-slate-400">
            Your name (audit trail)
          </label>
          <input
            type="text"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            placeholder="anonymous"
            className="focusable w-full max-w-xs rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[12px] text-slate-100 focus:border-sky-500 focus:outline-none"
          />
        </div>
      )}

      {error && (
        <div className="mb-2 text-[11px] text-rose-300">{error}</div>
      )}

      {showActions && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void decide('approve')}
            disabled={busy !== null}
            className="focusable inline-flex items-center gap-1 rounded-md border border-emerald-600 bg-emerald-700/30 px-3 py-1 text-[12px] font-semibold text-emerald-100 hover:bg-emerald-700/50 disabled:opacity-50"
          >
            <CheckCircle2 size={12} /> Approve
          </button>
          <button
            type="button"
            onClick={() => void decide('reject')}
            disabled={busy !== null}
            className="focusable inline-flex items-center gap-1 rounded-md border border-rose-600 bg-rose-700/30 px-3 py-1 text-[12px] font-semibold text-rose-100 hover:bg-rose-700/50 disabled:opacity-50"
          >
            <XCircle size={12} /> Reject
          </button>
        </div>
      )}

      {settled && (
        <div className="text-[11px] text-slate-300">
          Decided by{' '}
          <span className="font-mono text-slate-100">{approval.decidedBy ?? 'system'}</span>
          {approval.decidedAt && (
            <> at {new Date(approval.decidedAt).toLocaleString()}</>
          )}
        </div>
      )}

      {approval.approvers.length > 0 && (
        <div className="mt-2 text-[11px] text-slate-400">
          <span className="font-semibold uppercase tracking-wider text-slate-500">
            Decisions so far
          </span>
          <ul className="mt-0.5 space-y-0.5">
            {approval.approvers.map((a) => (
              <li key={`${a.actor}-${a.at}`} className="flex items-center gap-2">
                <span
                  className={
                    a.decision === 'approve'
                      ? 'inline-flex items-center gap-1 text-emerald-300'
                      : 'inline-flex items-center gap-1 text-rose-300'
                  }
                >
                  {a.decision === 'approve' ? (
                    <CheckCircle2 size={10} />
                  ) : (
                    <XCircle size={10} />
                  )}
                  {a.decision}
                </span>
                <span className="font-mono text-slate-300">{a.actor}</span>
                <span className="text-slate-500">
                  {new Date(a.at).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
