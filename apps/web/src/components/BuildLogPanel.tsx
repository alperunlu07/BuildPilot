import { useMemo, useState } from 'react';
import { Square } from 'lucide-react';
import type { BuildLogEntry, BuildLogLevel } from '@buildpilot/shared-types';
import { useStore } from '../store/store';
import { LogTable } from './LogTable';
import { LevelToggleBar, defaultActiveLevels } from './LevelToggleBar';
import { cn } from '../lib/cn';
import { commandFromEntry } from '../lib/copyCommand';

// Stable empty-array reference: returning a fresh `[]` from a Zustand
// selector triggers an infinite re-render loop because every call produces
// a new array identity.
const EMPTY: BuildLogEntry[] = [];

export function BuildLogPanel() {
  const activeBuild = useStore((s) => s.activeBuild);
  const entries = useStore((s) =>
    activeBuild ? (s.entriesByBuild[activeBuild.id] ?? EMPTY) : EMPTY,
  );
  const cancelBuild = useStore((s) => s.cancelBuild);
  const setView = useStore((s) => s.setView);
  const [activeLevels, setActiveLevels] = useState<Set<BuildLogLevel>>(() => defaultActiveLevels());

  const filtered = useMemo(
    () => entries.filter((e) => activeLevels.has(e.level)),
    [entries, activeLevels],
  );

  const toggleLevel = (lvl: BuildLogLevel) => {
    setActiveLevels((prev) => {
      const next = new Set(prev);
      if (next.has(lvl)) next.delete(lvl);
      else next.add(lvl);
      return next;
    });
  };

  if (!activeBuild) return null;

  const finished =
    activeBuild.status === 'success' ||
    activeBuild.status === 'failed' ||
    activeBuild.status === 'cancelled';

  return (
    <div className="flex h-72 shrink-0 flex-col border-t border-slate-800 bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-block h-2 w-2 rounded-full',
              activeBuild.status === 'running' && 'animate-pulse bg-amber-400',
              activeBuild.status === 'success' && 'bg-emerald-400',
              activeBuild.status === 'failed' && 'bg-rose-400',
              activeBuild.status === 'cancelled' && 'bg-slate-500',
              activeBuild.status === 'pending' && 'bg-slate-500',
            )}
          />
          <span className="font-medium uppercase tracking-wider text-slate-300">
            Build {activeBuild.status}
          </span>
          <span className="text-slate-500">·</span>
          <button
            type="button"
            onClick={() => setView({ type: 'build', id: activeBuild.id })}
            className="font-mono text-slate-500 hover:text-sky-400"
            title="Open full log"
          >
            {activeBuild.id.slice(0, 8)}
          </button>
          {activeBuild.triggerSha && (
            <>
              <span className="text-slate-500">·</span>
              <span className="font-mono text-sky-400">{activeBuild.triggerSha.slice(0, 7)}</span>
            </>
          )}
          <span className="text-slate-500">·</span>
          <span className="text-slate-500">
            {filtered.length === entries.length
              ? `${entries.length} entries`
              : `${filtered.length} / ${entries.length} entries`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <LevelToggleBar active={activeLevels} onToggle={toggleLevel} compact />
          {!finished && (
            <button
              type="button"
              onClick={() => void cancelBuild(activeBuild.id)}
              className="inline-flex items-center gap-1 rounded-md border border-rose-700/60 px-2 py-0.5 text-[11px] text-rose-300 hover:border-rose-500 hover:text-rose-200"
              title="Stop the running build"
            >
              <Square size={10} /> Cancel
            </button>
          )}
          {finished && (
            <span className="text-slate-500">
              Finished{' '}
              {activeBuild.finishedAt
                ? new Date(activeBuild.finishedAt).toLocaleTimeString()
                : ''}
            </span>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <LogTable entries={filtered} compact copyCommandFor={commandFromEntry} />
      </div>
    </div>
  );
}
