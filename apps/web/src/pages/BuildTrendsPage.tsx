import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BarChart3, RefreshCw, Timer, TrendingUp } from 'lucide-react';
import type { BuildTrendsReport } from '@buildpilot/shared-types';
import { useStore } from '../store/store';
import { api } from '../lib/api';

// Cluster 11.F — per-pipeline build trend page. Pulls up to 100 most
// recent builds and renders a duration sparkline + success-rate dot
// strip + P50/P95 stats + a spike alert when current P95 > 2× baseline.
//
// Re-uses the visual language from PipelineMetricsPanel rather than
// importing it directly so we can show a much wider sample without
// touching the embedded component's behavior.

const STATUS_COLOUR: Record<string, string> = {
  pending: 'bg-slate-700',
  running: 'bg-sky-500/80',
  success: 'bg-emerald-500/80',
  failed: 'bg-rose-500/80',
  cancelled: 'bg-amber-500/60',
};

const BUILD_COUNT_OPTIONS = [30, 50, 100, 200];

function formatDurationMs(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

function formatPct(r: number | null): string {
  if (r == null) return '—';
  return `${(r * 100).toFixed(1)}%`;
}

export function BuildTrendsPage() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const pipelines = useStore((s) => s.pipelines);
  const projects = useStore((s) => s.projects);
  const selectedPipelineId = view.type === 'trends' ? view.pipelineId : undefined;

  const [pipelineId, setPipelineId] = useState<string>(
    selectedPipelineId ?? pipelines[0]?.id ?? '',
  );
  const [buildCount, setBuildCount] = useState<number>(100);
  const [report, setReport] = useState<BuildTrendsReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (view.type !== 'trends') return;
    if (pipelineId && pipelineId !== view.pipelineId) {
      setView({ type: 'trends', pipelineId });
    }
  }, [pipelineId, view, setView]);

  useEffect(() => {
    if (selectedPipelineId && selectedPipelineId !== pipelineId) {
      setPipelineId(selectedPipelineId);
    } else if (!pipelineId && pipelines.length > 0) {
      setPipelineId(pipelines[0]!.id);
    }
  }, [selectedPipelineId, pipelines, pipelineId]);

  const load = useCallback(() => {
    if (!pipelineId) return;
    setLoading(true);
    setError(null);
    api
      .buildTrends(pipelineId, buildCount)
      .then((r) => setReport(r))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [pipelineId, buildCount]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-slate-800 bg-slate-900/40 px-3 py-3 sm:px-6">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-lg font-semibold text-slate-100">Build trends</h1>
          <span className="text-xs text-slate-400">
            P50/P95 duration + success-rate trend with regression alert when
            current P95 spikes 2× over the older-half baseline.
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <label className="text-slate-400">Pipeline:</label>
          <select
            value={pipelineId}
            onChange={(e) => setPipelineId(e.target.value)}
            className="focusable rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100"
          >
            <option value="">— Select pipeline —</option>
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {projects.find((pr) => pr.id === p.projectId)?.name
                  ? ` · ${projects.find((pr) => pr.id === p.projectId)!.name}`
                  : ''}
              </option>
            ))}
          </select>
          <label className="ml-2 text-slate-400">Window:</label>
          <select
            value={buildCount}
            onChange={(e) => setBuildCount(Number(e.target.value))}
            className="focusable rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100"
          >
            {BUILD_COUNT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                last {n} builds
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={load}
            className="focusable inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-slate-300 hover:border-sky-500 hover:text-sky-400"
            title="Reload"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6">
        {error && (
          <div className="mb-3 rounded-md border border-rose-900 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">
            {error}
          </div>
        )}
        {!pipelineId && (
          <div className="text-sm text-slate-400">Pick a pipeline to chart.</div>
        )}
        {pipelineId && report && <TrendBody report={report} />}
      </div>
    </div>
  );
}

function TrendBody({ report }: { report: BuildTrendsReport }) {
  const maxMs = Math.max(1, ...report.builds.map((b) => b.durationMs ?? 0));

  return (
    <div className="space-y-4">
      {report.p95SpikeDetected && report.baselineP95Ms != null && report.durationP95Ms != null && (
        <div className="flex items-center gap-2 rounded-md border border-rose-700 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
          <AlertTriangle size={14} className="shrink-0" />
          <span>
            <strong>P95 spike detected.</strong> Current P95{' '}
            <span className="font-mono">{formatDurationMs(report.durationP95Ms)}</span> is{' '}
            {(report.durationP95Ms / report.baselineP95Ms).toFixed(1)}× the older-half
            baseline of <span className="font-mono">{formatDurationMs(report.baselineP95Ms)}</span>.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="P50 duration" value={formatDurationMs(report.durationP50Ms)} icon={<Timer size={11} />} />
        <Stat
          label="P95 duration"
          value={formatDurationMs(report.durationP95Ms)}
          icon={<Timer size={11} />}
          tone={report.p95SpikeDetected ? 'warning' : undefined}
        />
        <Stat
          label="Baseline P95"
          value={formatDurationMs(report.baselineP95Ms)}
          icon={<TrendingUp size={11} />}
        />
        <Stat
          label="Success rate"
          value={formatPct(report.successRate)}
          icon={<BarChart3 size={11} />}
          tone={
            report.successRate != null && report.successRate < 0.5 ? 'warning' : undefined
          }
        />
      </div>

      <div>
        <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-400">
          <BarChart3 size={12} /> Duration · {report.buildsAnalyzed} builds (oldest → newest)
        </div>
        {report.builds.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-800 px-3 py-6 text-center text-[11px] text-slate-400">
            No build history yet.
          </div>
        ) : (
          <div className="flex h-24 items-end gap-[2px] rounded-md border border-slate-800 bg-slate-900/40 px-2 py-1">
            {report.builds.map((b) => {
              const h = b.durationMs ? Math.max(4, (b.durationMs / maxMs) * 88) : 4;
              const colour = STATUS_COLOUR[b.status] ?? 'bg-slate-700';
              return (
                <span
                  key={b.id}
                  title={`${b.status} · ${formatDurationMs(b.durationMs)} · ${new Date(b.startedAt).toLocaleString()}`}
                  aria-label={`${b.status}, ${formatDurationMs(b.durationMs)}`}
                  className={`w-1.5 rounded-sm ${colour}`}
                  style={{ height: `${h}px` }}
                />
              );
            })}
          </div>
        )}
      </div>

      <div>
        <div className="mb-1 text-[11px] uppercase tracking-wider text-slate-400">
          Status timeline
        </div>
        {report.builds.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-800 px-3 py-4 text-center text-[11px] text-slate-400">
            —
          </div>
        ) : (
          <div className="flex flex-wrap gap-[2px] rounded-md border border-slate-800 bg-slate-900/40 p-2">
            {report.builds.map((b) => (
              <span
                key={`s-${b.id}`}
                title={`${b.status} · ${new Date(b.startedAt).toLocaleString()}`}
                className={`h-2.5 w-2.5 rounded-sm ${STATUS_COLOUR[b.status] ?? 'bg-slate-700'}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  tone?: 'warning';
}) {
  return (
    <div
      className={
        'rounded-md border px-2 py-1.5 ' +
        (tone === 'warning'
          ? 'border-amber-800 bg-amber-950/30'
          : 'border-slate-800 bg-slate-900/40')
      }
    >
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-400">
        {icon}
        {label}
      </div>
      <div
        className={
          'text-sm font-semibold ' +
          (tone === 'warning' ? 'text-amber-200' : 'text-slate-100')
        }
      >
        {value}
      </div>
    </div>
  );
}
