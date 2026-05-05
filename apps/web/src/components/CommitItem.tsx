import { useState } from 'react';
import { ChevronRight, ChevronDown, GitMerge } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { laneColor, type GraphRow } from '../lib/graph';
import { cn } from '../lib/cn';

interface Props {
  row: GraphRow;
  width: number;
  isFirst: boolean;
  isLast: boolean;
  highlight?: boolean;
  isHead?: boolean;
}

const LANE_WIDTH = 18;
const SVG_HEIGHT = 40; // covers the top of the row including the dot + curves
const DOT_Y = 20;      // dot vertical center inside the SVG (also relative to LI top)
const DOT_R = 4;
const MERGE_R = 5;

export function CommitItem({ row, width, isFirst, isLast, highlight, isHead }: Props) {
  const [open, setOpen] = useState(false);
  const isMerge = row.parents.length >= 2;
  const hasBody = (row.body ?? '').trim().length > 0;

  const railWidth = (width + 0.5) * LANE_WIDTH;
  const cx = row.myLane * LANE_WIDTH + LANE_WIDTH / 2;
  const myColor = laneColor(row.myLane);

  return (
    <li className={cn('relative flex transition-colors', highlight && 'bg-amber-950/20')}>
      {/* Rail */}
      <div className="relative shrink-0 self-stretch" style={{ width: railWidth }}>
        {/* SVG with curves + dot, anchored to the top */}
        <svg
          width={railWidth}
          height={SVG_HEIGHT}
          className="absolute left-0 top-0"
          style={{ overflow: 'visible' }}
        >
          {/* TOP HALF — lanes coming in */}
          {!isFirst &&
            row.topLanes.map((sha, i) => {
              if (!sha) return null;
              const lx = i * LANE_WIDTH + LANE_WIDTH / 2;
              const color = laneColor(i);
              if (sha === row.sha && i !== row.myLane) {
                return (
                  <path
                    key={`tc-${i}`}
                    d={`M ${lx} 0 C ${lx} ${DOT_Y * 0.6}, ${cx} ${DOT_Y * 0.4}, ${cx} ${DOT_Y}`}
                    stroke={color}
                    strokeWidth={1.5}
                    fill="none"
                  />
                );
              }
              return (
                <line
                  key={`tl-${i}`}
                  x1={lx}
                  y1={0}
                  x2={lx}
                  y2={DOT_Y}
                  stroke={color}
                  strokeWidth={1.5}
                />
              );
            })}

          {/* BOTTOM HALF (within SVG) — lanes going out */}
          {!isLast &&
            row.bottomLanes.map((sha, i) => {
              if (!sha) return null;
              const lx = i * LANE_WIDTH + LANE_WIDTH / 2;
              const color = laneColor(i);
              const wasInTopAtSameIdx = row.topLanes[i] === sha;
              const isFreshFromCommit =
                !wasInTopAtSameIdx && (i === row.myLane || row.parents.includes(sha));

              if (isFreshFromCommit && i !== row.myLane) {
                return (
                  <path
                    key={`bc-${i}`}
                    d={`M ${cx} ${DOT_Y} C ${cx} ${DOT_Y + (SVG_HEIGHT - DOT_Y) * 0.4}, ${lx} ${DOT_Y + (SVG_HEIGHT - DOT_Y) * 0.6}, ${lx} ${SVG_HEIGHT}`}
                    stroke={color}
                    strokeWidth={1.5}
                    fill="none"
                  />
                );
              }
              return (
                <line
                  key={`bl-${i}`}
                  x1={lx}
                  y1={DOT_Y}
                  x2={lx}
                  y2={SVG_HEIGHT}
                  stroke={color}
                  strokeWidth={1.5}
                />
              );
            })}

          {/* Highlight halo (since last build) */}
          {highlight && (
            <circle
              cx={cx}
              cy={DOT_Y}
              r={MERGE_R + 3}
              fill="none"
              stroke="#fbbf24"
              strokeOpacity={0.55}
              strokeWidth={1.25}
            />
          )}
          {/* HEAD halo */}
          {isHead && (
            <circle
              cx={cx}
              cy={DOT_Y}
              r={MERGE_R + 5}
              fill="none"
              stroke="#38bdf8"
              strokeOpacity={0.55}
              strokeWidth={1.25}
              className="animate-pulse"
            />
          )}
          {/* Dot */}
          {isMerge ? (
            <circle cx={cx} cy={DOT_Y} r={MERGE_R} fill="#0f172a" stroke={myColor} strokeWidth={2.25} />
          ) : (
            <circle cx={cx} cy={DOT_Y} r={DOT_R} fill={myColor} />
          )}
        </svg>

        {/* CSS continuation lines: from end of SVG to bottom of LI (any height). */}
        {!isLast &&
          row.bottomLanes.map((sha, i) => {
            if (!sha) return null;
            const lx = i * LANE_WIDTH + LANE_WIDTH / 2;
            return (
              <span
                key={`bcss-${i}`}
                className="absolute w-px"
                style={{
                  top: SVG_HEIGHT,
                  bottom: 0,
                  left: lx - 0.5,
                  backgroundColor: laneColor(i),
                }}
              />
            );
          })}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 py-1.5 pr-3">
        <button
          type="button"
          onClick={() => hasBody && setOpen(!open)}
          className={cn(
            'flex w-full items-start gap-1.5 text-left',
            hasBody ? 'cursor-pointer' : 'cursor-default',
          )}
        >
          {hasBody ? (
            open ? (
              <ChevronDown size={13} className="mt-1 shrink-0 text-slate-500" />
            ) : (
              <ChevronRight size={13} className="mt-1 shrink-0 text-slate-500" />
            )
          ) : (
            <span className="w-3 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <code className="font-mono text-[11px] text-sky-400">{row.shortSha}</code>
              {isHead && (
                <span className="rounded-sm bg-sky-500/20 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wider text-sky-300">
                  HEAD
                </span>
              )}
              {isMerge && <GitMerge size={11} className="text-amber-400" />}
              <span className="truncate text-sm text-slate-100">{row.subject}</span>
            </div>
            <div className="mt-0.5 flex items-baseline gap-2 whitespace-nowrap text-[11px] text-slate-500">
              <span className="truncate">{row.author}</span>
              <span>·</span>
              <span>{formatDistanceToNow(row.date, { addSuffix: true })}</span>
              {isMerge && (
                <>
                  <span>·</span>
                  <span className="text-amber-400/80">merge of {row.parents.length}</span>
                </>
              )}
            </div>
          </div>
        </button>
        {open && hasBody && (
          <pre className="mt-1.5 ml-4 overflow-x-auto whitespace-pre-wrap rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-[12px] text-slate-300">
{row.body}
          </pre>
        )}
      </div>
    </li>
  );
}
