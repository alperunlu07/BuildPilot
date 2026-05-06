import { useEffect, useRef } from 'react';
import type { BuildLogEntry, BuildLogLevel, StepType } from '@buildpilot/shared-types';
import { cn } from '../lib/cn';

interface Props {
  entries: BuildLogEntry[];
  // Per-node display label, e.g. mapping nodeId → step type label. Optional.
  nodeLabel?(nodeId: string, stepType: StepType | null): string;
  // When true, autoscroll the table to the latest row whenever entries grow.
  follow?: boolean;
  // Compact = tighter row height for the bottom panel; default = roomier.
  compact?: boolean;
  emptyMessage?: string;
}

const LEVEL_STYLE: Record<BuildLogLevel, { dot: string; pill: string }> = {
  system:  { dot: 'bg-slate-400',   pill: 'bg-slate-700/50 text-slate-300' },
  info:    { dot: 'bg-sky-400',     pill: 'bg-sky-900/40 text-sky-300' },
  stdout:  { dot: 'bg-slate-500',   pill: 'bg-slate-800 text-slate-400' },
  stderr:  { dot: 'bg-amber-400',   pill: 'bg-amber-900/40 text-amber-300' },
  success: { dot: 'bg-emerald-400', pill: 'bg-emerald-900/40 text-emerald-300' },
  failure: { dot: 'bg-rose-400',    pill: 'bg-rose-900/40 text-rose-300' },
};

export function LogTable({
  entries,
  nodeLabel,
  follow = true,
  compact = false,
  emptyMessage = 'Waiting for output…',
}: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const followRef = useRef(follow);

  useEffect(() => {
    if (!followRef.current) return;
    const el = wrap.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [entries]);

  const onScroll = () => {
    const el = wrap.current;
    if (!el) return;
    followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  if (entries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-slate-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      ref={wrap}
      onScroll={onScroll}
      className="scrollbar-thin h-full overflow-y-auto font-mono text-[12px]"
    >
      <table className="w-full table-fixed border-separate border-spacing-0">
        <colgroup>
          <col className="w-[88px]" />
          <col className="w-[78px]" />
          <col className="w-[150px]" />
          <col />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur">
          <tr className="text-[10px] uppercase tracking-wider text-slate-500">
            <Th compact={compact}>Time</Th>
            <Th compact={compact}>Level</Th>
            <Th compact={compact}>Node</Th>
            <Th compact={compact}>Message</Th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const style = LEVEL_STYLE[e.level];
            return (
              <tr key={e.seq} className="border-t border-slate-900 hover:bg-slate-900/40">
                <Td compact={compact} mono className="text-slate-500">
                  {fmtTime(e.ts)}
                </Td>
                <Td compact={compact}>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                      style.pill,
                    )}
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full', style.dot)} />
                    {e.level}
                  </span>
                </Td>
                <Td compact={compact} mono className="truncate text-slate-300">
                  {e.nodeId
                    ? nodeLabel
                      ? nodeLabel(e.nodeId, e.stepType)
                      : `${e.stepType ?? '?'}:${e.nodeId.slice(0, 8)}`
                    : <span className="text-slate-600">—</span>}
                </Td>
                <Td
                  compact={compact}
                  mono
                  className={cn(
                    'whitespace-pre-wrap break-words text-slate-200',
                    e.level === 'stderr' && 'text-amber-200',
                    e.level === 'failure' && 'text-rose-300',
                    e.level === 'success' && 'text-emerald-300',
                  )}
                >
                  {e.message}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, compact }: { children: React.ReactNode; compact: boolean }) {
  return (
    <th
      className={cn(
        'border-b border-slate-800 px-2 text-left font-medium',
        compact ? 'py-1' : 'py-1.5',
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
  mono,
  compact,
}: {
  children: React.ReactNode;
  className?: string;
  mono?: boolean;
  compact: boolean;
}) {
  return (
    <td
      className={cn(
        'align-top px-2',
        compact ? 'py-0.5' : 'py-1',
        mono && 'font-mono',
        className,
      )}
    >
      {children}
    </td>
  );
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}
