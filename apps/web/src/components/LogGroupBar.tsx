import { ChevronDown, ChevronRight, FolderOpen } from 'lucide-react';
import type { LogGroup } from '../lib/logGroups';
import { cn } from '../lib/cn';

interface Props {
  groups: LogGroup[];
  collapsed: ReadonlySet<string>;
  onToggle(id: string): void;
  onToggleAll(allCollapsed: boolean): void;
}

// Strip showing detected log groups (`::group::name` / `--- name`). Click a
// chip to collapse / expand the entries inside; the parent filters them out
// of the LogTable view.
export function LogGroupBar({ groups, collapsed, onToggle, onToggleAll }: Props) {
  if (groups.length === 0) return null;
  const allCollapsed = groups.every((g) => collapsed.has(g.id));
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-800 bg-slate-900/30 px-6 py-2 text-xs">
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
        <FolderOpen size={11} /> Sections ({groups.length})
      </span>
      {groups.map((g) => {
        const isCollapsed = collapsed.has(g.id);
        return (
          <button
            key={g.id}
            type="button"
            onClick={() => onToggle(g.id)}
            className={cn(
              'group inline-flex max-w-xs items-center gap-1 rounded border px-1.5 py-0.5 text-[11px]',
              isCollapsed
                ? 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                : 'border-slate-700 bg-slate-800 text-slate-100',
            )}
            title={`${g.count} lines${g.failureCount ? ` · ${g.failureCount} failure${g.failureCount === 1 ? '' : 's'}` : ''}${g.stderrCount ? ` · ${g.stderrCount} stderr` : ''}`}
          >
            {isCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
            <span className="min-w-0 truncate">{g.name}</span>
            <span className="shrink-0 text-[10px] text-slate-500">{g.count}</span>
            {g.failureCount > 0 && (
              <span className="shrink-0 text-[10px] text-rose-400">
                ✕{g.failureCount}
              </span>
            )}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => onToggleAll(allCollapsed)}
        className="ml-auto rounded border border-slate-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-slate-400 hover:border-sky-500 hover:text-sky-300"
        title={allCollapsed ? 'Expand all sections' : 'Collapse all sections'}
      >
        {allCollapsed ? 'Expand all' : 'Collapse all'}
      </button>
    </div>
  );
}
