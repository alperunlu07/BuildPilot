// Cluster 11.A — audit-log viewer.

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ClipboardList, RefreshCcw } from 'lucide-react';
import type {
  AuditAction,
  AuditEvent,
  AuditResource,
} from '@buildpilot/shared-types';
import { api } from '../lib/api';

const ACTIONS: AuditAction[] = ['create', 'update', 'delete', 'login', 'logout', 'other'];
const RESOURCES: AuditResource[] = [
  'project',
  'pipeline',
  'build',
  'host',
  'config',
  'user',
  'auth',
  'apiToken',
  'nodeTemplate',
  'other',
];

interface Filters {
  actor: string;
  action: AuditAction | '';
  resource: AuditResource | '';
  since: string;
  until: string;
}

function toMillis(local: string): number | undefined {
  if (!local) return undefined;
  const n = Date.parse(local);
  return Number.isFinite(n) ? n : undefined;
}

function actionLabel(a: AuditAction): string {
  return a.charAt(0).toUpperCase() + a.slice(1);
}

function statusColor(code: number): string {
  if (code >= 500) return 'text-rose-300';
  if (code >= 400) return 'text-amber-300';
  if (code >= 300) return 'text-sky-300';
  return 'text-emerald-300';
}

export function AuditLogPage() {
  const [filters, setFilters] = useState<Filters>({
    actor: '',
    action: '',
    resource: '',
    since: '',
    until: '',
  });
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [actors, setActors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listAuditEvents({
        actor: filters.actor || undefined,
        action: filters.action || undefined,
        resource: filters.resource || undefined,
        since: toMillis(filters.since),
        until: toMillis(filters.until),
        limit: 500,
      });
      setEvents(res.events);
      setTruncated(res.truncated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    void api
      .listAuditActors()
      .then(setActors)
      .catch(() => {
        // ignore — actor select stays as a text input fallback.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const byAction = new Map<string, number>();
    for (const e of events) byAction.set(e.action, (byAction.get(e.action) ?? 0) + 1);
    return byAction;
  }, [events]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-100">
            <ClipboardList size={18} className="text-sky-400" />
            Audit log
          </h1>
          <p className="text-xs text-slate-400">
            Records every state-mutating request (POST / PATCH / DELETE) along with the actor,
            HTTP status, and resource. Reads are not logged.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          className="focusable flex items-center gap-1 rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-sky-500 hover:text-sky-300"
        >
          <RefreshCcw size={13} />
          Refresh
        </button>
      </header>

      <div className="grid grid-cols-1 gap-3 rounded-md border border-slate-800 bg-slate-900/40 p-3 sm:grid-cols-5">
        <FilterField label="Actor">
          {actors.length > 0 ? (
            <select
              value={filters.actor}
              onChange={(e) => setFilters((f) => ({ ...f, actor: e.target.value }))}
              className="focusable w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
            >
              <option value="">All actors</option>
              {actors.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={filters.actor}
              onChange={(e) => setFilters((f) => ({ ...f, actor: e.target.value }))}
              className="focusable w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
              placeholder="username"
            />
          )}
        </FilterField>
        <FilterField label="Action">
          <select
            value={filters.action}
            onChange={(e) =>
              setFilters((f) => ({ ...f, action: e.target.value as AuditAction | '' }))
            }
            className="focusable w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
          >
            <option value="">All actions</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {actionLabel(a)}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Resource">
          <select
            value={filters.resource}
            onChange={(e) =>
              setFilters((f) => ({ ...f, resource: e.target.value as AuditResource | '' }))
            }
            className="focusable w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
          >
            <option value="">All resources</option>
            {RESOURCES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Since">
          <input
            type="datetime-local"
            value={filters.since}
            onChange={(e) => setFilters((f) => ({ ...f, since: e.target.value }))}
            className="focusable w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
          />
        </FilterField>
        <FilterField label="Until">
          <input
            type="datetime-local"
            value={filters.until}
            onChange={(e) => setFilters((f) => ({ ...f, until: e.target.value }))}
            className="focusable w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
          />
        </FilterField>
        <div className="sm:col-span-5">
          <button
            type="button"
            onClick={() => void reload()}
            className="focusable rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
          >
            Apply filters
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-[11px] text-slate-400">
        <span>{events.length} events</span>
        {truncated && (
          <span className="text-amber-300">
            Result was capped at 500 — tighten filters to see older events.
          </span>
        )}
        {Array.from(stats.entries()).map(([a, n]) => (
          <span key={a}>
            <span className="text-slate-500">{a}:</span> {n}
          </span>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-rose-700/50 bg-rose-900/30 px-3 py-2 text-xs text-rose-200">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full overflow-hidden rounded-md border border-slate-800 text-xs">
          <thead className="bg-slate-900 text-[10px] uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-2 py-1.5 text-left">Time</th>
              <th className="px-2 py-1.5 text-left">Actor</th>
              <th className="px-2 py-1.5 text-left">Action</th>
              <th className="px-2 py-1.5 text-left">Resource</th>
              <th className="px-2 py-1.5 text-left">Resource id</th>
              <th className="px-2 py-1.5 text-left">Path</th>
              <th className="px-2 py-1.5 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-2 py-3 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : events.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-2 py-3 text-center text-slate-400">
                  No events match the filters.
                </td>
              </tr>
            ) : (
              events.map((e) => (
                <tr key={e.id} className="border-t border-slate-800 hover:bg-slate-900/40">
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[11px] text-slate-300">
                    {new Date(e.ts).toLocaleString()}
                  </td>
                  <td className="px-2 py-1.5 text-slate-200">{e.actor}</td>
                  <td className="px-2 py-1.5 text-slate-200">{actionLabel(e.action)}</td>
                  <td className="px-2 py-1.5 text-slate-200">{e.resource}</td>
                  <td className="px-2 py-1.5 font-mono text-[11px] text-slate-400">
                    {e.resourceId ?? '—'}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-[11px] text-slate-400">
                    <span className="text-slate-500">{e.method}</span> {e.path}
                  </td>
                  <td className={`px-2 py-1.5 font-mono text-[11px] ${statusColor(e.statusCode)}`}>
                    {e.statusCode}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] uppercase tracking-wider text-slate-400">{label}</label>
      {children}
    </div>
  );
}
