import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FixedSizeList, type ListChildComponentProps } from 'react-window';
import type { BuildLogEntry, BuildLogLevel, StepType } from '@buildpilot/shared-types';
import { cn } from '../lib/cn';

interface Props {
  entries: BuildLogEntry[];
  // Per-node display label, e.g. mapping nodeId → step type label. Optional.
  nodeLabel?(nodeId: string, stepType: StepType | null): string;
  // When true, autoscroll the list to the latest row whenever entries grow.
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

// Fixed row heights so we can virtualize with a FixedSizeList. Long messages
// are clipped to a single line with overflow:hidden + title attribute; users
// can hover to see the full text. Without fixed heights we'd need
// VariableSizeList + per-row measurement, which costs more for big logs.
const ROW_H = 24;
const ROW_H_COMPACT = 20;

// Grid column template — kept in sync between header and body rows so they
// align. Last column (message) flexes.
const GRID_COLS = 'minmax(0, 88px) minmax(0, 78px) minmax(0, 150px) minmax(0, 1fr)';

export function LogTable({
  entries,
  nodeLabel,
  follow = true,
  compact = false,
  emptyMessage = 'Waiting for output…',
}: Props) {
  const rowH = compact ? ROW_H_COMPACT : ROW_H;
  const listRef = useRef<FixedSizeList>(null);
  const followRef = useRef(follow);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // Measure the container so FixedSizeList knows how tall/wide to be. Using
  // ResizeObserver instead of forcing height: 100% on the list because the
  // sticky header above it eats some vertical space.
  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setSize({ w: rect.width, h: rect.height });
    });
    ro.observe(el);
    const rect = el.getBoundingClientRect();
    setSize({ w: rect.width, h: rect.height });
    return () => ro.disconnect();
  }, []);

  // Autoscroll on new entries, but only if user hasn't scrolled away from the
  // bottom. The onScroll handler updates followRef so we stop pinning to
  // bottom once the user scrolls up to inspect.
  useEffect(() => {
    if (!followRef.current) return;
    if (entries.length === 0) return;
    listRef.current?.scrollToItem(entries.length - 1, 'end');
  }, [entries.length]);

  const itemData = useMemo(
    () => ({ entries, nodeLabel, compact, rowH }),
    [entries, nodeLabel, compact, rowH],
  );

  if (entries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-slate-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col font-mono text-[12px]">
      <div
        className={cn(
          'sticky top-0 z-10 grid border-b border-slate-800 bg-slate-950/95 px-2 backdrop-blur',
          compact ? 'py-1' : 'py-1.5',
        )}
        style={{ gridTemplateColumns: GRID_COLS }}
      >
        <Th>Time</Th>
        <Th>Level</Th>
        <Th>Node</Th>
        <Th>Message</Th>
      </div>
      <div ref={wrapperRef} className="flex-1 min-h-0">
        {size.h > 0 && (
          <FixedSizeList
            ref={listRef}
            height={size.h}
            width={size.w}
            itemCount={entries.length}
            itemSize={rowH}
            itemData={itemData}
            overscanCount={20}
            onScroll={({ scrollOffset, scrollUpdateWasRequested }) => {
              if (scrollUpdateWasRequested) return;
              const max = entries.length * rowH - size.h;
              followRef.current = max - scrollOffset < rowH * 2;
            }}
            // Inline class for the inner container — react-window manages
            // its own scroll, we just style the scrollbar.
            className="scrollbar-thin"
          >
            {Row}
          </FixedSizeList>
        )}
      </div>
    </div>
  );
}

interface RowItemData {
  entries: BuildLogEntry[];
  nodeLabel?(nodeId: string, stepType: StepType | null): string;
  compact: boolean;
  rowH: number;
}

function Row({ index, style, data }: ListChildComponentProps<RowItemData>) {
  const { entries, nodeLabel, compact } = data;
  const e = entries[index]!;
  const lvlStyle = LEVEL_STYLE[e.level];
  return (
    <div
      style={style}
      className={cn(
        'grid items-center border-t border-slate-900 px-2 hover:bg-slate-900/40',
        compact ? 'py-0' : 'py-0',
      )}
    >
      <div
        className="grid w-full items-center"
        style={{ gridTemplateColumns: GRID_COLS, height: '100%' }}
      >
        <span className="truncate text-slate-500">{fmtTime(e.ts)}</span>
        <span
          className={cn(
            'inline-flex w-fit items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
            lvlStyle.pill,
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', lvlStyle.dot)} />
          {e.level}
        </span>
        <span className="truncate text-slate-300">
          {e.nodeId
            ? nodeLabel
              ? nodeLabel(e.nodeId, e.stepType)
              : `${e.stepType ?? '?'}:${e.nodeId.slice(0, 8)}`
            : <span className="text-slate-600">—</span>}
        </span>
        <span
          // Single-line truncation; full text on hover so virtualization
          // can keep a fixed row height.
          title={e.message}
          className={cn(
            'truncate text-slate-200',
            e.level === 'stderr' && 'text-amber-200',
            e.level === 'failure' && 'text-rose-300',
            e.level === 'success' && 'text-emerald-300',
          )}
        >
          {e.message}
        </span>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <span className="truncate text-left text-[10px] font-medium uppercase tracking-wider text-slate-500">
      {children}
    </span>
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
