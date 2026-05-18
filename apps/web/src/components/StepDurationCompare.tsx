import { useEffect, useMemo, useState } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import type { Build, BuildLogEntry, StepType } from '@buildpilot/shared-types';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import {
  diffStepDurations,
  stepDurationsFromEntries,
  type StepDurationDelta,
} from '../lib/stepDurations';

interface Props {
  build: Build;
  entries: BuildLogEntry[];
  // Optional human label for a node id (e.g. step type · short id).
  nodeLabel?(nodeId: string, stepType: StepType | null): string;
}

// Shown on finished builds: a side-by-side per-step duration row with a
// signed delta vs the most recent successful build for the same pipeline.
// Returns null while loading or when there's no baseline to compare against.
export function StepDurationCompare({ build, entries, nodeLabel }: Props) {
  const [baseline, setBaseline] = useState<{
    build: Build;
    entries: BuildLogEntry[];
  } | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'no-baseline'>('loading');

  // Only run on finished builds — running builds would diff incomplete spans.
  const finished =
    build.status === 'success' || build.status === 'failed' || build.status === 'cancelled';

  useEffect(() => {
    if (!finished) return;
    let alive = true;
    setState('loading');
    setBaseline(null);
    (async () => {
      try {
        const list = await api.listBuilds({ pipelineId: build.pipelineId, limit: 50 });
        const prev = list.find(
          (b) => b.id !== build.id && b.status === 'success' && b.startedAt < build.startedAt,
        );
        if (!alive) return;
        if (!prev) {
          setState('no-baseline');
          return;
        }
        const ents = await api.getBuildEntries(prev.id);
        if (!alive) return;
        setBaseline({ build: prev, entries: ents });
        setState('ready');
      } catch {
        if (alive) setState('no-baseline');
      }
    })();
    return () => {
      alive = false;
    };
  }, [build.id, build.pipelineId, finished]);

  const deltas: StepDurationDelta[] = useMemo(() => {
    if (!baseline) return [];
    const cur = stepDurationsFromEntries(entries);
    const prev = stepDurationsFromEntries(baseline.entries);
    return diffStepDurations(cur, prev);
  }, [entries, baseline]);

  if (!finished || state !== 'ready' || deltas.length === 0) return null;

  return (
    <div className="border-b border-slate-800 bg-slate-900/30 px-3 py-3 sm:px-6">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-1">
        <span className="text-[10px] uppercase tracking-wider text-slate-400">
          Step durations vs last green build
        </span>
        <span className="text-[10px] text-slate-400">
          baseline: <span className="font-mono text-slate-300">
            {baseline!.build.id.slice(0, 8)}
          </span>
        </span>
      </div>
      <ul className="grid grid-cols-1 gap-1 md:grid-cols-2">
        {deltas.map((d) => (
          <li
            key={d.nodeId}
            className="flex items-baseline gap-2 rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-[11px]"
          >
            <span className="min-w-0 flex-1 truncate font-mono text-slate-200">
              {nodeLabel ? nodeLabel(d.nodeId, d.stepType) : `${d.stepType ?? '?'} · ${d.nodeId.slice(0, 8)}`}
            </span>
            <span className="shrink-0 font-mono text-slate-300">{formatDur(d.current)}</span>
            <span className="shrink-0 text-slate-400">vs</span>
            <span className="shrink-0 font-mono text-slate-400">
              {d.previous === null ? '—' : formatDur(d.previous)}
            </span>
            <DeltaPill delta={d} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function DeltaPill({ delta }: { delta: StepDurationDelta }) {
  if (delta.previous === null) {
    return <span className="shrink-0 text-[10px] uppercase tracking-wider text-slate-400">new</span>;
  }
  if (delta.deltaMs === null || delta.deltaMs === 0) {
    return <span className="shrink-0 text-[10px] text-slate-400">±0</span>;
  }
  const isSlower = delta.deltaMs > 0;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 text-[10px] font-semibold',
        isSlower ? 'text-rose-400' : 'text-emerald-400',
      )}
      title={`${isSlower ? '+' : ''}${formatDur(delta.deltaMs)} vs baseline`}
    >
      {isSlower ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {delta.deltaPct === null
        ? `${isSlower ? '+' : ''}${formatDur(delta.deltaMs)}`
        : `${isSlower ? '+' : ''}${delta.deltaPct.toFixed(0)}%`}
    </span>
  );
}

function formatDur(ms: number): string {
  const abs = Math.abs(ms);
  if (abs < 1000) return `${ms}ms`;
  if (abs < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(abs / 60_000);
  const s = Math.round((abs % 60_000) / 1000);
  return `${ms < 0 ? '-' : ''}${m}m${s}s`;
}
