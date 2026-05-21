import { useEffect, useState } from 'react';
import { Timer, BarChart3 } from 'lucide-react';
import type { PipelineMetrics } from '@buildpilot/shared-types';
import { api } from '../lib/api';

// Cluster 10.D — per-pipeline metrics: P50/P95 build duration, a 30-cell
// duration sparkline (newest-on-right), and a top-5 slowest-step
// leaderboard. Self-contained so it can be rendered from the home page
// (current usage) or, later, embedded into PipelinePage without changes.

interface Props {
  pipelineId: string;
  // When true, render in a compact mode that fits inside a small card.
  compact?: boolean;
}

function formatDurationMs(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

const STATUS_COLOUR: Record<string, string> = {
  pending: 'bg-border-subtle',
  running: 'bg-sky-500/80',
  success: 'bg-emerald-500/80',
  failed: 'bg-rose-500/80',
  cancelled: 'bg-amber-500/60',
};

export function PipelineMetricsPanel({ pipelineId, compact }: Props) {
  const [data, setData] = useState<PipelineMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    api
      .pipelineMetrics(pipelineId)
      .then((r) => {
        if (alive) setData(r);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [pipelineId]);

  if (error) {
    return (
      <div className="rounded-md border border-rose-900 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">
        Metrics unavailable: {error}
      </div>
    );
  }
  if (!data) return null;

  // Bar heights for the duration sparkline are scaled to the slowest
  // duration in the sample. Builds with no duration (still running, no
  // finish ts) render as faint empty bars so the slot stays visible.
  const maxMs = Math.max(
    1,
    ...data.recentBuilds.map((b) => b.durationMs ?? 0),
  );

  return (
    <div className={compact ? 'text-xs' : 'text-sm'}>
      <div className="mb-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Stat label="P50 duration" value={formatDurationMs(data.durationP50Ms)} />
        <Stat label="P95 duration" value={formatDurationMs(data.durationP95Ms)} />
        <Stat
          label="Sample"
          value={`${data.recentBuilds.length} build${data.recentBuilds.length === 1 ? '' : 's'}`}
        />
      </div>

      <div className="mb-3">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-text-muted">
          <BarChart3 size={12} />
          Duration · last {data.recentBuilds.length} builds
        </div>
        {data.recentBuilds.length === 0 ? (
          <div className="rounded-md border border-dashed border-border-subtle px-3 py-4 text-center text-[11px] text-text-muted">
            No build history yet.
          </div>
        ) : (
          <div className="flex h-12 items-end gap-[2px] rounded-md border border-border-subtle bg-bg-panel/60 px-2 py-1">
            {data.recentBuilds.map((b) => {
              const h = b.durationMs ? Math.max(4, (b.durationMs / maxMs) * 40) : 4;
              const colour = STATUS_COLOUR[b.status] ?? 'bg-border-subtle';
              return (
                <span
                  key={b.id}
                  title={`${b.status} · ${formatDurationMs(b.durationMs)} · ${new Date(b.startedAt).toLocaleString()}`}
                  aria-label={`${b.status}, ${formatDurationMs(b.durationMs)}`}
                  className={`w-1 rounded-sm ${colour}`}
                  style={{ height: `${h}px` }}
                />
              );
            })}
          </div>
        )}
      </div>

      <div>
        <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-text-muted">
          <Timer size={12} />
          Slowest steps
        </div>
        {data.slowestSteps.length === 0 ? (
          <div className="rounded-md border border-dashed border-border-subtle px-3 py-4 text-center text-[11px] text-text-muted">
            Step durations appear after the first finished build.
          </div>
        ) : (
          <ul className="space-y-1">
            {data.slowestSteps.map((s) => {
              const pct = data.slowestSteps[0]
                ? Math.max(4, (s.avgDurationMs / data.slowestSteps[0].avgDurationMs) * 100)
                : 0;
              return (
                <li
                  key={s.nodeId}
                  className="grid grid-cols-[1fr_60px_60px] items-center gap-2 rounded-md bg-bg-panel/60 px-2 py-1"
                >
                  <div className="min-w-0">
                    <div className="truncate text-text-primary">{s.stepType}</div>
                    <div className="mt-0.5 h-1 w-full rounded-full bg-bg-elevated">
                      <div
                        className="h-1 rounded-full bg-amber-500/70"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-right text-amber-300">
                    {formatDurationMs(s.avgDurationMs)}
                  </span>
                  <span className="text-right text-[10px] text-text-muted">
                    n={s.sampleCount}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-panel/60 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
      <div className="text-sm font-semibold text-text-primary">{value}</div>
    </div>
  );
}
