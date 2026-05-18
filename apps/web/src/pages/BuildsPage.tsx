import { useEffect, useMemo, useState } from 'react';
import { Filter, RefreshCw } from 'lucide-react';
import type { Build, BuildStatus } from '@buildpilot/shared-types';
import { useStore } from '../store/store';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { Time } from '../lib/formatDate';

type StatusFilter = 'all' | BuildStatus;

const STATUS_LABELS: Record<BuildStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  success: 'Success',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export function BuildsPage() {
  const projects = useStore((s) => s.projects);
  const pipelines = useStore((s) => s.pipelines);
  const setView = useStore((s) => s.setView);

  const [projectId, setProjectId] = useState<string>('');
  const [pipelineId, setPipelineId] = useState<string>('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [builds, setBuilds] = useState<Build[]>([]);
  const [loading, setLoading] = useState(false);

  const visiblePipelines = useMemo(
    () => (projectId ? pipelines.filter((p) => p.projectId === projectId) : pipelines),
    [pipelines, projectId],
  );

  const reload = async () => {
    setLoading(true);
    try {
      const list = await api.listBuilds({
        projectId: projectId || undefined,
        pipelineId: pipelineId || undefined,
        limit: 200,
      });
      setBuilds(status === 'all' ? list : list.filter((b) => b.status === status));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, [projectId, pipelineId, status]);

  // Refresh whenever a build event lands so the list stays live.
  useEffect(() => {
    const id = setInterval(() => void reload(), 5_000);
    return () => clearInterval(id);
  }, [projectId, pipelineId, status]);

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const pipelineMap = useMemo(() => new Map(pipelines.map((p) => [p.id, p])), [pipelines]);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-5 flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Builds</h1>
          <p className="mt-1 text-sm text-slate-400">
            Every build that has ever run on this machine. Logs are kept indefinitely.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-200 hover:border-sky-500 hover:text-sky-400 disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs">
        <Filter size={12} className="text-slate-500" />
        <label className="flex items-center gap-1.5 text-slate-400">
          Project
          <select
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setPipelineId('');
            }}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100 focus:border-sky-500 focus:outline-none"
          >
            <option value="">(all)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-slate-400">
          Pipeline
          <select
            value={pipelineId}
            onChange={(e) => setPipelineId(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100 focus:border-sky-500 focus:outline-none"
          >
            <option value="">(all)</option>
            {visiblePipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-slate-400">
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100 focus:border-sky-500 focus:outline-none"
          >
            <option value="all">(all)</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>

      {builds.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-800 bg-slate-900/40 p-10 text-center text-sm text-slate-500">
          No builds match the current filters.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/60 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Project</th>
                <th className="px-3 py-2">Pipeline</th>
                <th className="px-3 py-2">Branch</th>
                <th className="px-3 py-2">Commit</th>
                <th className="px-3 py-2">Started</th>
                <th className="px-3 py-2">Duration</th>
              </tr>
            </thead>
            <tbody>
              {builds.map((b) => {
                const proj = projectMap.get(b.projectId);
                const pipe = pipelineMap.get(b.pipelineId);
                return (
                  <tr
                    key={b.id}
                    onClick={() => setView({ type: 'build', id: b.id })}
                    className="cursor-pointer border-t border-slate-800 hover:bg-slate-900/60"
                  >
                    <td className="px-3 py-2">
                      <StatusBadge status={b.status} />
                    </td>
                    <td className="px-3 py-2 text-slate-200">{proj?.name ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-300">{pipe?.name ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-emerald-400">{b.triggerBranch}</td>
                    <td className="px-3 py-2 font-mono text-sky-400">
                      {b.triggerSha ? b.triggerSha.slice(0, 7) : '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-400">
                      <Time ts={b.startedAt} />
                    </td>
                    <td className="px-3 py-2 text-slate-400">{formatDuration(b)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: BuildStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium',
        status === 'running' && 'bg-amber-950/50 text-amber-300',
        status === 'success' && 'bg-emerald-950/50 text-emerald-300',
        status === 'failed' && 'bg-rose-950/50 text-rose-300',
        status === 'pending' && 'bg-slate-800 text-slate-400',
        status === 'cancelled' && 'bg-slate-800 text-slate-500',
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          status === 'running' && 'animate-pulse bg-amber-400',
          status === 'success' && 'bg-emerald-400',
          status === 'failed' && 'bg-rose-400',
          status === 'pending' && 'bg-slate-500',
          status === 'cancelled' && 'bg-slate-600',
        )}
      />
      {STATUS_LABELS[status]}
    </span>
  );
}

function formatDuration(b: Build): string {
  if (!b.finishedAt) return b.status === 'running' ? '…' : '—';
  const ms = b.finishedAt - b.startedAt;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}
