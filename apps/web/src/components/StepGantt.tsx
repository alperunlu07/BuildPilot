import { useMemo } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import type { BuildLogEntry, StepType } from '@buildpilot/shared-types';
import { cn } from '../lib/cn';

interface Props {
  entries: BuildLogEntry[];
  // Optional outer bounds; defaults to first → last entry timestamp.
  startedAt?: number;
  finishedAt?: number;
  // Map nodeId → human label (e.g. step type). Falls back to stepType:idShort.
  nodeLabel?(nodeId: string, stepType: StepType | null): string;
  // Click a bar to focus that node (e.g. set parent's filter).
  onSelect?(nodeId: string): void;
  selectedNodeId?: string | null;
}

interface Span {
  nodeId: string;
  stepType: StepType | null;
  start: number;
  end: number;
  status: 'running' | 'success' | 'failed';
}

const COLOR: Record<Span['status'], string> = {
  running: 'bg-amber-500/70',
  success: 'bg-emerald-500/70',
  failed:  'bg-rose-500/70',
};

export function StepGantt({
  entries,
  startedAt,
  finishedAt,
  nodeLabel,
  onSelect,
  selectedNodeId,
}: Props) {
  const { spans, t0, t1 } = useMemo(() => computeSpans(entries, startedAt, finishedAt), [
    entries,
    startedAt,
    finishedAt,
  ]);

  if (spans.length === 0) return null;

  const totalMs = Math.max(1, t1 - t0);

  return (
    <div className="space-y-1 px-6 py-3">
      <div className="flex items-baseline justify-between text-[10px] uppercase tracking-wider text-slate-500">
        <span>Step timeline</span>
        <span className="font-mono">{formatDuration(totalMs)} total</span>
      </div>
      <div className="space-y-1">
        {spans.map((s) => {
          const left = ((s.start - t0) / totalMs) * 100;
          const width = Math.max(0.5, ((s.end - s.start) / totalMs) * 100);
          const label = nodeLabel ? nodeLabel(s.nodeId, s.stepType) : `${s.stepType ?? '?'}`;
          const dur = formatDuration(s.end - s.start);
          const isSelected = selectedNodeId === s.nodeId;
          const StatusIcon =
            s.status === 'running' ? Loader2 : s.status === 'success' ? Check : X;
          return (
            <button
              type="button"
              key={s.nodeId}
              onClick={() => onSelect?.(s.nodeId)}
              className={cn(
                'focusable group relative block h-5 w-full overflow-hidden rounded-sm border text-left',
                isSelected ? 'border-sky-500' : 'border-slate-800 hover:border-slate-600',
              )}
              title={`${label} · ${s.status} · ${dur}`}
              aria-label={`${label}, ${s.status}, duration ${dur}`}
            >
              <span
                className={cn('absolute top-0 h-full', COLOR[s.status])}
                style={{ left: `${left}%`, width: `${width}%` }}
              />
              <span className="relative z-10 flex h-full items-center justify-between px-2 text-[10px] font-mono text-slate-100 mix-blend-difference">
                <span className="flex min-w-0 items-center gap-1.5">
                  <StatusIcon
                    size={10}
                    className={s.status === 'running' ? 'motion-safe:animate-spin' : ''}
                    aria-hidden="true"
                  />
                  <span className="truncate">{label}</span>
                </span>
                <span className="ml-2 shrink-0 text-slate-200/90">{dur}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function computeSpans(
  entries: BuildLogEntry[],
  startedAt: number | undefined,
  finishedAt: number | undefined,
): { spans: Span[]; t0: number; t1: number } {
  if (entries.length === 0) {
    const t0 = startedAt ?? 0;
    const t1 = finishedAt ?? t0;
    return { spans: [], t0, t1 };
  }
  const t0 = startedAt ?? entries[0]!.ts;
  const t1 = finishedAt ?? entries[entries.length - 1]!.ts;

  const map = new Map<string, Span>();
  for (const e of entries) {
    if (!e.nodeId) continue;
    const cur = map.get(e.nodeId);
    if (!cur) {
      map.set(e.nodeId, {
        nodeId: e.nodeId,
        stepType: e.stepType,
        start: e.ts,
        end: e.ts,
        status: 'running',
      });
      continue;
    }
    cur.end = Math.max(cur.end, e.ts);
    if (e.level === 'success') cur.status = 'success';
    else if (e.level === 'failure') cur.status = 'failed';
  }
  const spans = [...map.values()].sort((a, b) => a.start - b.start);
  return { spans, t0, t1 };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}
