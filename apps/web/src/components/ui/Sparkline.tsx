import { useId, type CSSProperties } from 'react';
import { cn } from '../../lib/cn';

// UI v2 primitive — 30-bar SVG strip used on Project cards / list rows to
// show the last N build outcomes. Pure presentational: callers fetch data
// and map it into the `bars` prop. Each bar is a status token, so theme
// dark/light swap repaints the strip without re-render.
//
// Hover tooltip is delegated to the parent — primitive renders bare
// rectangles so consumers can decide whether to wire a tooltip per-bar
// or just rely on the html title attribute below.
export type SparklineStatus =
  | 'success'
  | 'failed'
  | 'running'
  | 'pending'
  | 'cancel'
  | 'skipped'
  | 'empty';

export interface SparklineBar {
  status: SparklineStatus;
  // Optional native tooltip surface ("#42 — success — 2m 14s"). We use
  // title rather than a custom popover because rendering 30 popovers in a
  // hot list (Projects page) would be a layout-shift / accessibility-cost
  // tradeoff that doesn't pay off.
  tooltip?: string;
}

export interface SparklineProps {
  bars: ReadonlyArray<SparklineBar>;
  // Total slot count. Empty slots are padded on the LEFT so the rightmost
  // bar is always "newest"; matches BuildSparkline semantics.
  slots?: number;
  // Bar height in pixels. Width is auto from the container.
  height?: number;
  className?: string;
  style?: CSSProperties;
}

const STATUS_FILL: Record<SparklineStatus, string> = {
  success: 'var(--st-success)',
  failed: 'var(--st-failed)',
  running: 'var(--st-running)',
  pending: 'var(--st-pending)',
  cancel: 'var(--st-cancel)',
  skipped: 'var(--st-skipped)',
  // Empty: faint outline only, so the strip width stays stable for
  // projects with < N builds.
  empty: 'var(--border-subtle)',
};

export function Sparkline({
  bars,
  slots = 30,
  height = 22,
  className,
  style,
}: SparklineProps): JSX.Element {
  // Random-suffix the clip-id so multiple sparklines on the same page
  // don't collide. useId is React-managed so SSR doesn't drift.
  const id = useId();

  const padCount = Math.max(0, slots - bars.length);
  const padded: ReadonlyArray<SparklineBar> = [
    ...Array.from({ length: padCount }, () => ({ status: 'empty' as const })),
    ...bars,
  ];
  // Each bar is a percentage slot so the strip is fluid; gap is ~1/3 of
  // bar width to match the design's compact spacing.
  const slotPct = 100 / slots;
  const barWidthPct = slotPct * 0.7;
  const gapPct = slotPct * 0.3;

  return (
    <svg
      className={cn('block w-full overflow-visible', className)}
      style={{ height, ...style }}
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Last ${slots} builds`}
    >
      {padded.map((bar, i) => {
        const x = i * slotPct + gapPct / 2;
        return (
          <rect
            key={`${id}-${i}`}
            x={x}
            y={0}
            width={barWidthPct}
            height={height}
            rx={1}
            fill={STATUS_FILL[bar.status]}
            opacity={bar.status === 'empty' ? 0.5 : 0.9}
          >
            {bar.tooltip && <title>{bar.tooltip}</title>}
          </rect>
        );
      })}
    </svg>
  );
}
