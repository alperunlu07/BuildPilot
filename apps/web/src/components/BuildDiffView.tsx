import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, GitCompareArrows, X } from 'lucide-react';
import type { Build, BuildLogEntry, StepType } from '@buildpilot/shared-types';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { stripAnsi } from '../lib/ansi';
import {
  diffStepDurations,
  stepDurationsFromEntries,
  type StepDurationDelta,
} from '../lib/stepDurations';

interface Props {
  current: Build;
  // List of builds for the same pipeline to populate the picker. Pre-loaded
  // by the parent so this component stays self-contained otherwise.
  candidates: Build[];
  nodeLabel?(nodeId: string, stepType: StepType | null): string;
  onClose(): void;
}

interface LoadedSide {
  build: Build;
  entries: BuildLogEntry[];
}

// Modal that picks a baseline build and shows step duration deltas + the
// first diverging log line between the two runs.
export function BuildDiffView({ current, candidates, nodeLabel, onClose }: Props) {
  const initialBase = useMemo(() => {
    const ordered = candidates.filter((b) => b.id !== current.id);
    return ordered[0]?.id ?? '';
  }, [candidates, current.id]);

  const [baseId, setBaseId] = useState(initialBase);
  const [curSide, setCurSide] = useState<LoadedSide | null>(null);
  const [baseSide, setBaseSide] = useState<LoadedSide | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!baseId) return;
    let alive = true;
    setLoading(true);
    setError(null);
    Promise.all([
      api.getBuildEntries(current.id),
      api.getBuild(baseId),
      api.getBuildEntries(baseId),
    ])
      .then(([curEntries, baseBuild, baseEntries]) => {
        if (!alive) return;
        setCurSide({ build: current, entries: curEntries });
        setBaseSide({ build: baseBuild, entries: baseEntries });
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [baseId, current]);

  const deltas: StepDurationDelta[] = useMemo(() => {
    if (!curSide || !baseSide) return [];
    return diffStepDurations(
      stepDurationsFromEntries(curSide.entries),
      stepDurationsFromEntries(baseSide.entries),
    );
  }, [curSide, baseSide]);

  // First diverging log line: walk both message streams in order and find
  // the first non-matching pair. We compare stripped-ANSI messages so a
  // color flip alone doesn't read as a divergence. Levels must also agree.
  const divergence = useMemo(() => {
    if (!curSide || !baseSide) return null;
    return findFirstDivergence(curSide.entries, baseSide.entries);
  }, [curSide, baseSide]);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-bg-base/80 p-4 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-border-subtle bg-bg-panel shadow-2xl">
        <header className="flex items-center justify-between border-b border-border-subtle bg-bg-panel px-4 py-2">
          <div className="flex items-center gap-2">
            <GitCompareArrows size={14} className="text-accent" />
            <span className="text-sm font-semibold text-text-primary">Build diff</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
            title="Close"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle bg-bg-panel/60 px-4 py-2 text-xs">
          <span className="text-text-muted">Baseline</span>
          <select
            value={baseId}
            onChange={(e) => setBaseId(e.target.value)}
            className="min-w-[20rem] rounded-md border border-border-subtle bg-bg-panel px-2 py-1 text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="">— pick a build —</option>
            {candidates
              .filter((b) => b.id !== current.id)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.id.slice(0, 8)} · {b.status} · {new Date(b.startedAt).toLocaleString()}
                </option>
              ))}
          </select>
          <ArrowRight size={12} className="text-text-muted" />
          <span className="font-mono text-text-secondary">
            {current.id.slice(0, 8)} · {current.status}
          </span>
          {loading && <span className="text-text-muted">loading…</span>}
          {error && <span className="text-rose-400">{error}</span>}
        </div>

        <div className="grid min-h-0 flex-1 grid-rows-[1fr_auto] gap-0 overflow-hidden">
          <div className="min-h-0 overflow-y-auto p-4">
            <h3 className="mb-2 text-[10px] uppercase tracking-wider text-text-muted">
              Step duration delta
            </h3>
            {deltas.length === 0 ? (
              <p className="text-xs text-text-muted">
                {baseId
                  ? 'Pick a baseline build to compare.'
                  : 'No previous builds available for this pipeline.'}
              </p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-text-muted">
                  <tr>
                    <th className="py-1">Step</th>
                    <th className="py-1 text-right">Current</th>
                    <th className="py-1 text-right">Baseline</th>
                    <th className="py-1 text-right">Δ</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {deltas.map((d) => (
                    <tr key={d.nodeId} className="border-t border-border-subtle">
                      <td className="py-1 text-text-primary">
                        {nodeLabel
                          ? nodeLabel(d.nodeId, d.stepType)
                          : `${d.stepType ?? '?'} · ${d.nodeId.slice(0, 8)}`}
                      </td>
                      <td className="py-1 text-right text-text-secondary">
                        {formatDur(d.current)}
                      </td>
                      <td className="py-1 text-right text-text-muted">
                        {d.previous === null ? '—' : formatDur(d.previous)}
                      </td>
                      <td
                        className={cn(
                          'py-1 text-right',
                          d.deltaMs === null && 'text-text-muted',
                          d.deltaMs !== null && d.deltaMs > 0 && 'text-rose-400',
                          d.deltaMs !== null && d.deltaMs < 0 && 'text-emerald-400',
                          d.deltaMs === 0 && 'text-text-muted',
                        )}
                      >
                        {d.deltaMs === null
                          ? 'new'
                          : d.deltaPct === null
                            ? formatDur(d.deltaMs)
                            : `${d.deltaMs > 0 ? '+' : ''}${d.deltaPct.toFixed(0)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="border-t border-border-subtle bg-bg-base/60 p-4">
            <h3 className="mb-2 text-[10px] uppercase tracking-wider text-text-muted">
              First diverging log line
            </h3>
            {!curSide || !baseSide ? (
              <p className="text-xs text-text-muted">—</p>
            ) : !divergence ? (
              <p className="text-xs text-text-muted">
                Log streams match through the shorter run; nothing diverged.
              </p>
            ) : (
              <div className="space-y-1 font-mono text-[11px]">
                <DiffLine label="baseline" entry={divergence.baseEntry} />
                <DiffLine label="current" entry={divergence.curEntry} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DiffLine({
  label,
  entry,
}: {
  label: string;
  entry: BuildLogEntry | null;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-16 shrink-0 text-[10px] uppercase tracking-wider text-text-muted">
        {label}
      </span>
      {entry ? (
        <>
          <span className="shrink-0 text-text-muted">[{entry.level}]</span>
          <span className="break-words text-text-primary">{stripAnsi(entry.message)}</span>
        </>
      ) : (
        <span className="text-text-muted">(end of stream)</span>
      )}
    </div>
  );
}

function findFirstDivergence(
  cur: BuildLogEntry[],
  base: BuildLogEntry[],
): { curEntry: BuildLogEntry | null; baseEntry: BuildLogEntry | null } | null {
  const len = Math.min(cur.length, base.length);
  for (let i = 0; i < len; i++) {
    const c = cur[i]!;
    const b = base[i]!;
    if (c.level !== b.level || stripAnsi(c.message) !== stripAnsi(b.message)) {
      return { curEntry: c, baseEntry: b };
    }
  }
  if (cur.length !== base.length) {
    return { curEntry: cur[len] ?? null, baseEntry: base[len] ?? null };
  }
  return null;
}

function formatDur(ms: number): string {
  const abs = Math.abs(ms);
  if (abs < 1000) return `${ms}ms`;
  if (abs < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(abs / 60_000);
  const s = Math.round((abs % 60_000) / 1000);
  return `${ms < 0 ? '-' : ''}${m}m${s}s`;
}
