import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  HardDrive,
  RefreshCw,
  Timer,
  TrendingUp,
} from 'lucide-react';
import { Time } from '../lib/formatDate';
import type { HomeMetrics } from '@buildpilot/shared-types';
import { api } from '../lib/api';
import { useStore } from '../store/store';
import { PipelineMetricsPanel } from '../components/PipelineMetricsPanel';

// Cluster 10.D — metrics-led landing view. Surfaces the numbers an
// operator wants at a glance: how many builds are in-flight right now,
// how green the last 24h were, where the slowest pipelines are, and
// how much disk we're using.

function formatDurationMs(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MiB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GiB`;
}

function formatPercent(rate: number | null): string {
  if (rate == null) return '—';
  return `${(rate * 100).toFixed(0)}%`;
}

export function HomePage() {
  const setView = useStore((s) => s.setView);
  const [metrics, setMetrics] = useState<HomeMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setMetrics(await api.homeMetrics());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Soft auto-refresh every 10s so the dashboard reflects new builds
  // without forcing the user to hit "refresh".
  useEffect(() => {
    const id = setInterval(() => void reload(), 10_000);
    return () => clearInterval(id);
  }, [reload]);

  return (
    <div className="mx-auto max-w-6xl p-8">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Dashboard</h1>
          <p className="mt-1 text-sm text-text-muted">
            At-a-glance build health for this BuildPilot instance.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          disabled={loading}
          className="focusable inline-flex items-center gap-1 rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-primary hover:border-accent hover:text-accent disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'motion-safe:animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-rose-900 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">
          Failed to load metrics: {error}
        </div>
      )}

      {!metrics && !error && (
        <div className="rounded-md border border-border-subtle bg-bg-panel/60 p-10 text-center text-sm text-text-muted">
          Loading…
        </div>
      )}

      {metrics && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={<Activity size={16} className="text-amber-400" />}
              label="Running"
              value={String(metrics.runningBuildsCount)}
              hint={metrics.runningBuildsCount === 0 ? 'idle' : 'builds in flight'}
            />
            <StatCard
              icon={<TrendingUp size={16} className="text-emerald-400" />}
              label="Success rate · 24h"
              value={formatPercent(metrics.successRate24h)}
              hint={
                metrics.builds24h === 0
                  ? 'no builds in last 24h'
                  : `${metrics.successes24h} ok · ${metrics.failures24h} failed · ${metrics.cancelled24h} cancelled`
              }
            />
            <StatCard
              icon={<CheckCircle2 size={16} className="text-accent" />}
              label="Builds · 24h"
              value={String(metrics.builds24h)}
              hint="finished in last 24h"
            />
            <button
              type="button"
              onClick={() => setView({ type: 'diskUsage' })}
              className="text-left"
            >
              <StatCard
                icon={<HardDrive size={16} className="text-text-secondary" />}
                label="Disk usage"
                value={formatBytes(metrics.diskUsage.totalBytes)}
                hint={`${metrics.diskUsage.artifactCount} artifacts · ${metrics.diskUsage.buildCount} builds`}
                clickable
              />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="rounded-md border border-border-subtle bg-bg-panel/60">
              <header className="flex items-center gap-2 border-b border-border-subtle px-4 py-2 text-sm text-text-secondary">
                <AlertTriangle size={14} className="text-rose-400" />
                Recent failures
              </header>
              <div className="p-2">
                {metrics.recentFailures.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-text-muted">
                    No failed builds. Nice.
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {metrics.recentFailures.map((b) => (
                      <li key={b.id}>
                        <button
                          type="button"
                          onClick={() => setView({ type: 'build', id: b.id })}
                          className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-xs hover:bg-bg-hover/60"
                        >
                          <span className="min-w-0 flex-1 truncate">
                            <span className="text-rose-400">●</span>{' '}
                            <span className="text-text-primary">{b.projectName}</span>{' '}
                            <span className="text-text-muted">/</span>{' '}
                            <span className="text-text-secondary">{b.pipelineName}</span>
                          </span>
                          <span className="font-mono text-emerald-400">{b.triggerBranch}</span>
                          <Time ts={b.startedAt} className="text-text-muted" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="rounded-md border border-border-subtle bg-bg-panel/60">
              <header className="flex items-center gap-2 border-b border-border-subtle px-4 py-2 text-sm text-text-secondary">
                <Timer size={14} className="text-amber-400" />
                Slowest pipelines
              </header>
              <div className="p-2">
                {metrics.slowestPipelines.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-text-muted">
                    No successful builds yet — run a pipeline to see metrics.
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {metrics.slowestPipelines.map((p) => (
                      <li key={p.pipelineId}>
                        <button
                          type="button"
                          onClick={() => setView({ type: 'pipeline', id: p.pipelineId })}
                          className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-xs hover:bg-bg-hover/60"
                        >
                          <span className="min-w-0 flex-1 truncate">
                            <span className="text-text-primary">{p.projectName}</span>{' '}
                            <span className="text-text-muted">/</span>{' '}
                            <span className="text-text-secondary">{p.pipelineName}</span>
                          </span>
                          <span className="text-amber-300">{formatDurationMs(p.avgDurationMs)}</span>
                          <span className="text-text-muted">avg · n={p.sampleCount}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>

          {metrics.slowestPipelines.length > 0 && (
            <section className="mt-6">
              <header className="mb-2 flex items-center gap-2 text-sm text-text-secondary">
                <Timer size={14} className="text-amber-400" />
                <span>Per-pipeline detail</span>
                <span className="text-[11px] text-text-muted">
                  · top {Math.min(3, metrics.slowestPipelines.length)} by avg duration
                </span>
              </header>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                {metrics.slowestPipelines.slice(0, 3).map((p) => (
                  <div
                    key={p.pipelineId}
                    className="rounded-md border border-border-subtle bg-bg-panel/60 p-3"
                  >
                    <button
                      type="button"
                      onClick={() => setView({ type: 'pipeline', id: p.pipelineId })}
                      className="mb-2 block w-full truncate text-left text-sm text-text-primary hover:text-accent"
                      title="Open pipeline editor"
                    >
                      {p.projectName} <span className="text-text-muted">/</span>{' '}
                      <span className="text-text-secondary">{p.pipelineName}</span>
                    </button>
                    <PipelineMetricsPanel pipelineId={p.pipelineId} compact />
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  clickable,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  clickable?: boolean;
}) {
  return (
    <div
      className={
        'rounded-md border border-border-subtle bg-bg-panel/60 px-4 py-3' +
        (clickable ? ' transition-colors hover:border-sky-700' : '')
      }
    >
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-text-muted">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-2xl font-semibold text-text-primary">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-text-muted">{hint}</div>}
    </div>
  );
}
