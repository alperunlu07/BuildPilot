import { useEffect, useMemo, useState } from 'react';
import { Layers, RefreshCw } from 'lucide-react';
import type { Build, QueueLaneSnapshot } from '@buildpilot/shared-types';
import { useStore } from '../store/store';
import { cn } from '../lib/cn';

// WP5 (queue): "Execution Queue" board. Polls /api/queue every few seconds
// so the dashboard reflects the coordinator's live state without us having
// to teach SSE about a new event type.
const POLL_MS = 3_000;

export function QueuePage() {
  const queue = useStore((s) => s.queue);
  const loadQueue = useStore((s) => s.loadQueue);
  const projects = useStore((s) => s.projects);
  const pipelines = useStore((s) => s.pipelines);
  const setView = useStore((s) => s.setView);

  // `now` ticks every second so the "queued for Ns" labels stay live without
  // re-fetching. Decoupled from the data poll on purpose — refetching the
  // whole snapshot once a second would be wasteful when the coordinator
  // ticks at multi-second intervals.
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      await loadQueue();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    const id = setInterval(() => void loadQueue(), POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const pipelineMap = useMemo(() => new Map(pipelines.map((p) => [p.id, p])), [pipelines]);

  const lanes = queue?.lanes ?? [];

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-5 flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Execution Queue</h1>
          <p className="mt-1 text-sm text-slate-400">
            Pending and running builds, grouped by lane. Polled every {POLL_MS / 1000}s.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {queue && (
            <span className="text-slate-500" title={new Date(queue.generatedAt).toLocaleString()}>
              Updated {formatRelative(now - queue.generatedAt)} ago
            </span>
          )}
          <button
            type="button"
            onClick={() => void reload()}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1 text-slate-200 hover:border-sky-500 hover:text-sky-400 disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {queue === null ? (
        <div className="rounded-md border border-dashed border-slate-800 bg-slate-900/40 p-10 text-center text-sm text-slate-500">
          Loading queue…
        </div>
      ) : lanes.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-800 bg-slate-900/40 p-10 text-center text-sm text-slate-500">
          No lanes configured.
        </div>
      ) : (
        <div className="space-y-4">
          {lanes.map((laneSnap) => (
            <LaneCard
              key={laneSnap.lane.id}
              snap={laneSnap}
              now={now}
              onBuildClick={(id) => setView({ type: 'build', id })}
              pipelineName={(id) => pipelineMap.get(id)?.name ?? '—'}
              projectNameForPipeline={(pipelineId) => {
                const pipe = pipelineMap.get(pipelineId);
                if (!pipe) return '—';
                return projectMap.get(pipe.projectId)?.name ?? '—';
              }}
              pipelinePriority={(id) => pipelineMap.get(id)?.priority ?? 100}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface LaneCardProps {
  snap: QueueLaneSnapshot;
  now: number;
  onBuildClick(id: string): void;
  pipelineName(pipelineId: string): string;
  projectNameForPipeline(pipelineId: string): string;
  pipelinePriority(pipelineId: string): number;
}

function LaneCard({
  snap,
  now,
  onBuildClick,
  pipelineName,
  projectNameForPipeline,
  pipelinePriority,
}: LaneCardProps) {
  const { lane, running, pending } = snap;
  return (
    <section className="overflow-hidden rounded-md border border-slate-800 bg-slate-900/40">
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-sky-400" />
          <h2 className="text-base font-semibold text-slate-100">{lane.name}</h2>
        </div>
        <span className="rounded-md border border-slate-700 bg-slate-950/50 px-2 py-0.5 text-[11px] font-medium text-slate-300">
          max concurrency: {lane.maxConcurrency}
        </span>
      </header>

      <div className="grid grid-cols-1 divide-y divide-slate-800 md:grid-cols-2 md:divide-x md:divide-y-0">
        <div className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[11px] uppercase tracking-wider text-amber-400">Running</h3>
            <span className="text-[11px] text-slate-500">
              {running.length}/{lane.maxConcurrency}
            </span>
          </div>
          {running.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-800 px-3 py-4 text-center text-xs text-slate-500">
              Idle
            </div>
          ) : (
            <ul className="space-y-1.5">
              {running.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => onBuildClick(b.id)}
                    className="block w-full rounded-md border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-left text-xs hover:border-amber-600/60"
                  >
                    <BuildLine
                      build={b}
                      now={now}
                      pipelineName={pipelineName(b.pipelineId)}
                      projectName={projectNameForPipeline(b.pipelineId)}
                      label="running for"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[11px] uppercase tracking-wider text-slate-400">Pending</h3>
            <span className="text-[11px] text-slate-500">{pending.length}</span>
          </div>
          {pending.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-800 px-3 py-4 text-center text-xs text-slate-500">
              No pending builds
            </div>
          ) : (
            <ul className="space-y-1.5">
              {pending.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => onBuildClick(b.id)}
                    className="block w-full rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2 text-left text-xs hover:border-sky-700"
                  >
                    <BuildLine
                      build={b}
                      now={now}
                      pipelineName={pipelineName(b.pipelineId)}
                      projectName={projectNameForPipeline(b.pipelineId)}
                      priority={pipelinePriority(b.pipelineId)}
                      label="queued for"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

interface BuildLineProps {
  build: Build;
  now: number;
  pipelineName: string;
  projectName: string;
  priority?: number;
  label: string;
}

function BuildLine({ build, now, pipelineName, projectName, priority, label }: BuildLineProps) {
  const sha = build.triggerSha ? build.triggerSha.slice(0, 7) : '—';
  const elapsed = Math.max(0, now - build.startedAt);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {priority !== undefined && <PriorityBadge value={priority} />}
      <span className="font-medium text-slate-100">{pipelineName}</span>
      <span className="text-slate-500">·</span>
      <span className="text-slate-400">{projectName}</span>
      <span className="font-mono text-emerald-400">{build.triggerBranch}</span>
      <span className="font-mono text-sky-400">{sha}</span>
      <span className="ml-auto text-[11px] text-slate-500">
        {label} {formatDuration(elapsed)}
      </span>
    </div>
  );
}

function PriorityBadge({ value }: { value: number }) {
  // Lower numbers = higher priority. Three colour bands mirror common
  // "high / normal / low" intuition without us having to surface raw
  // semantics in the UI.
  const tone =
    value < 100
      ? 'border-rose-700/60 bg-rose-950/40 text-rose-300'
      : value > 100
        ? 'border-slate-700 bg-slate-800/60 text-slate-400'
        : 'border-sky-700/60 bg-sky-950/40 text-sky-300';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-mono',
        tone,
      )}
      title="Pipeline priority (lower = sooner)"
    >
      p{value}
    </span>
  );
}

// Compact "5s" / "1m 23s" / "2h 4m" — matches BuildsPage.formatDuration in
// spirit but reads off a precomputed elapsed-ms value so live-ticking is
// trivial. Falls back gracefully for ms-scale waits.
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatRelative(ms: number): string {
  if (ms < 1500) return 'just now';
  return formatDuration(ms);
}
