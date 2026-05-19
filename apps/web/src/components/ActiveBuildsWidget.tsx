import { useEffect, useState } from 'react';
import { Activity, Circle, Loader2, Square } from 'lucide-react';
import type { Build } from '@buildpilot/shared-types';
import { useStore } from '../store/store';
import { cn } from '../lib/cn';
import { statusLabel } from '../lib/statusIcon';

// Cluster 10.D — active-builds widget. A sticky pill that floats at the
// bottom-right of the dashboard whenever there is at least one
// pending/running build. Click the pill to expand a list with per-build
// cancel buttons + jump-to-build link.
//
// Render once from App.tsx — the component subscribes to the store
// itself, so no props are needed. It auto-hides when no builds are
// in-flight so it never gets in the way during idle periods.

const ACTIVE_STATUSES = new Set<Build['status']>([
  'pending',
  'running',
  // Cluster 11.D — parked on manual approval but still in-flight.
  'awaiting_approval',
]);

function formatElapsed(ms: number): string {
  if (ms < 1000) return '<1s';
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

export function ActiveBuildsWidget() {
  const builds = useStore((s) => s.builds);
  const pipelines = useStore((s) => s.pipelines);
  const projects = useStore((s) => s.projects);
  const cancelBuild = useStore((s) => s.cancelBuild);
  const setView = useStore((s) => s.setView);
  const requestConfirmation = useStore((s) => s.requestConfirmation);

  const [expanded, setExpanded] = useState(false);
  // Re-render every second so elapsed labels stay live.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const active = builds.filter((b) => ACTIVE_STATUSES.has(b.status));
  if (active.length === 0) return null;

  const pipelineNameFor = (id: string) => pipelines.find((p) => p.id === id)?.name ?? 'pipeline';
  const projectNameFor = (id: string) => projects.find((p) => p.id === id)?.name ?? 'project';

  return (
    <div className="pointer-events-auto fixed bottom-4 right-4 z-40">
      {expanded ? (
        <div className="w-80 overflow-hidden rounded-md border border-slate-700 bg-slate-900 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
              <Activity size={12} className="motion-safe:animate-pulse text-amber-400" aria-hidden="true" />
              {active.length} active build{active.length === 1 ? '' : 's'}
            </div>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="focusable rounded p-0.5 text-slate-400 hover:text-slate-100"
              title="Collapse"
              aria-label="Collapse active builds widget"
            >
              ×
            </button>
          </div>
          <ul className="max-h-72 overflow-y-auto">
            {active.map((b) => {
              const elapsed = Date.now() - b.startedAt;
              return (
                <li key={b.id} className="border-b border-slate-800/60 px-3 py-2 last:border-b-0">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setExpanded(false);
                        setView({ type: 'build', id: b.id });
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate text-xs text-slate-200">
                        {projectNameFor(b.projectId)}{' '}
                        <span className="text-slate-400">/</span>{' '}
                        <span className="text-slate-300">{pipelineNameFor(b.pipelineId)}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px]">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded px-1.5 py-0.5',
                            b.status === 'running' && 'bg-amber-950/50 text-amber-300',
                            b.status === 'pending' && 'bg-slate-800 text-slate-400',
                          )}
                          role="status"
                          aria-label={statusLabel(b.status)}
                        >
                          {b.status === 'running' ? (
                            <Loader2
                              size={10}
                              className="motion-safe:animate-spin text-amber-300"
                              aria-hidden="true"
                            />
                          ) : (
                            <Circle size={8} className="text-slate-400" aria-hidden="true" />
                          )}
                          {b.status}
                        </span>
                        <span className="font-mono text-emerald-400">{b.triggerBranch}</span>
                        <span className="text-slate-400">{formatElapsed(elapsed)}</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        requestConfirmation({
                          title: 'Cancel this build?',
                          body: 'The runner stops at the next step boundary.',
                          variant: 'destructive',
                          confirmLabel: 'Cancel build',
                          cancelLabel: 'Keep running',
                          onConfirm: () => cancelBuild(b.id),
                        })
                      }
                      className="focusable rounded-md border border-slate-700 p-1 text-slate-300 hover:border-rose-700 hover:text-rose-400"
                      title="Cancel this build"
                      aria-label="Cancel this build"
                    >
                      <Square size={12} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="focusable flex items-center gap-2 rounded-full border border-amber-700/60 bg-amber-950/80 px-3 py-1.5 text-xs font-medium text-amber-200 shadow-lg backdrop-blur hover:border-amber-600"
          aria-label={`Show ${active.length} active build${active.length === 1 ? '' : 's'}`}
        >
          <Activity size={12} className="motion-safe:animate-pulse" aria-hidden="true" />
          {active.length} active build{active.length === 1 ? '' : 's'}
        </button>
      )}
    </div>
  );
}
