import { useEffect, useRef } from 'react';
import { useStore } from '../store/store';
import { cn } from '../lib/cn';

export function BuildLogPanel() {
  const activeBuild = useStore((s) => s.activeBuild);
  const liveLog = useStore((s) => s.liveLog);
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [liveLog]);

  if (!activeBuild) return null;

  const finished = activeBuild.status === 'success' || activeBuild.status === 'failed';

  return (
    <div className="flex h-64 shrink-0 flex-col border-t border-slate-800 bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-block h-2 w-2 rounded-full',
              activeBuild.status === 'running' && 'animate-pulse bg-amber-400',
              activeBuild.status === 'success' && 'bg-emerald-400',
              activeBuild.status === 'failed' && 'bg-rose-400',
              activeBuild.status === 'pending' && 'bg-slate-500',
            )}
          />
          <span className="font-medium uppercase tracking-wider text-slate-300">
            Build {activeBuild.status}
          </span>
          <span className="text-slate-500">·</span>
          <span className="font-mono text-slate-500">{activeBuild.id.slice(0, 8)}</span>
          {activeBuild.triggerSha && (
            <>
              <span className="text-slate-500">·</span>
              <span className="font-mono text-sky-400">{activeBuild.triggerSha.slice(0, 7)}</span>
            </>
          )}
        </div>
        {finished && (
          <span className="text-slate-500">
            Finished {activeBuild.finishedAt ? new Date(activeBuild.finishedAt).toLocaleTimeString() : ''}
          </span>
        )}
      </div>
      <pre
        ref={ref}
        className="scrollbar-thin flex-1 overflow-y-auto px-4 py-3 font-mono text-[12px] leading-relaxed text-slate-300"
      >
{liveLog || activeBuild.log || 'Waiting for output…'}
      </pre>
    </div>
  );
}
