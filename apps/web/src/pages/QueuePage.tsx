import { useEffect, useMemo, useState } from 'react';
import { Layers, RefreshCw } from 'lucide-react';
import type { Build, QueueLaneSnapshot } from '@buildpilot/shared-types';
import { useStore } from '../store/store';
import { cn } from '../lib/cn';
import { PageContainer } from '../components/ui/PageContainer';

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
    <PageContainer maxWidth="72rem">
      <div className="mb-5 flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Execution Queue</h1>
          <p className="mt-1 text-sm text-text-muted">
            Pending and running builds, grouped by lane. Polled every {POLL_MS / 1000}s.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {queue && (
            <span className="text-text-faint" title={new Date(queue.generatedAt).toLocaleString()}>
              Updated {formatRelative(now - queue.generatedAt)} ago
            </span>
          )}
          <button
            type="button"
            onClick={() => void reload()}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-md border border-border-subtle px-2.5 py-1 text-text-primary hover:border-accent hover:text-accent disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {queue === null ? (
        <div className="rounded-md border border-dashed border-border-subtle bg-bg-panel/60 p-10 text-center text-sm text-text-faint">
          Loading queue…
        </div>
      ) : lanes.length === 0 ? (
        <div className="rounded-md border border-dashed border-border-subtle bg-bg-panel/60 p-10 text-center text-sm text-text-faint">
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
    </PageContainer>
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
    <section className="overflow-hidden rounded-md border border-border-subtle bg-bg-panel/60">
      <header className="flex items-center justify-between border-b border-border-subtle bg-bg-panel px-4 py-3">
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-accent" />
          <h2 className="text-base font-semibold text-text-primary">{lane.name}</h2>
        </div>
        <span className="rounded-md border border-border-subtle bg-bg-base/50 px-2 py-0.5 text-[11px] font-medium text-text-secondary">
          max concurrency: {lane.maxConcurrency}
        </span>
      </header>

      <div className="grid grid-cols-1 divide-y divide-border-subtle md:grid-cols-2 md:divide-x md:divide-y-0">
        <div className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[11px] uppercase tracking-wider text-amber-400">Running</h3>
            <span className="text-[11px] text-text-faint">
              {running.length}/{lane.maxConcurrency}
            </span>
          </div>
          {running.length === 0 ? (
            <div className="rounded-md border border-dashed border-border-subtle px-3 py-4 text-center text-xs text-text-faint">
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
            <h3 className="text-[11px] uppercase tracking-wider text-text-muted">Pending</h3>
            <span className="text-[11px] text-text-faint">{pending.length}</span>
          </div>
          {pending.length === 0 ? (
            <div className="rounded-md border border-dashed border-border-subtle px-3 py-4 text-center text-xs text-text-faint">
              No pending builds
            </div>
          ) : (
            <ul className="space-y-1.5">
              {pending.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => onBuildClick(b.id)}
                    className="block w-full rounded-md border border-border-subtle bg-bg-base/40 px-3 py-2 text-left text-xs hover:border-sky-700"
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
      <span className="font-medium text-text-primary">{pipelineName}</span>
      <span className="text-text-faint">·</span>
      <span className="text-text-muted">{projectName}</span>
      <span className="font-mono text-emerald-400">{build.triggerBranch}</span>
      <span className="font-mono text-accent">{sha}</span>
      <span className="ml-auto text-[11px] text-text-faint">
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
        ? 'border-border-subtle bg-bg-hover/60 text-text-muted'
        : 'border-sky-700/60 bg-sky-950/40 text-accent-hover';
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
