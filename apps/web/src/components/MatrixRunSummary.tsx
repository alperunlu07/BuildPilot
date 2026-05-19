import { useMemo } from 'react';
import { RotateCw } from 'lucide-react';
import type { Build, BuildStatus } from '@buildpilot/shared-types';
import { cn } from '../lib/cn';
import { statusIcon, statusIconAnimationClass, statusLabel } from '../lib/statusIcon';

// Cluster 11.C — N×M grid view rendered on the parent BuildDetailPage of
// a matrix run. Each cell shows the per-child status + matrix label and
// links to the child build. A "Rerun failed cells only" button at the top
// kicks off `/api/builds/:id/rerun-failed` (wired by the page-level
// onRerunFailed callback so this component stays presentational).

interface Props {
  parent: Build;
  children: Build[];
  onOpenChild: (childId: string) => void;
  onRerunFailed: () => void;
  rerunning?: boolean;
}

// We render the grid two-dimensionally when the matrix has exactly two
// axes (the most common shape) so the user gets a real cross-product
// table. With 1 or 3+ axes we fall back to a flat list of pill cells.
function pickAxesForGrid(
  children: Build[],
): { rowAxis: string; colAxis: string } | null {
  const axisNames = new Set<string>();
  for (const c of children) {
    if (c.matrixValues) {
      for (const k of Object.keys(c.matrixValues)) axisNames.add(k);
    }
  }
  if (axisNames.size !== 2) return null;
  const sorted = [...axisNames].sort();
  const a = sorted[0];
  const b = sorted[1];
  if (!a || !b) return null;
  return { rowAxis: a, colAxis: b };
}

function axisValues(children: Build[], axis: string): string[] {
  const set = new Set<string>();
  for (const c of children) {
    const v = c.matrixValues?.[axis];
    if (v !== undefined) set.add(v);
  }
  // Sort naturally so 9 < 10. Numeric-aware compare keeps versions like
  // "v2.9" / "v2.10" stable.
  return [...set].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }),
  );
}

// Within a (row, col) cell there may be MULTIPLE child builds if the user
// has hit "rerun failed cells" repeatedly. We display the most recent one
// as the primary cell and stack any prior passes underneath with reduced
// opacity so the history is visible at a glance.
function childrenForCell(
  children: Build[],
  rowAxis: string,
  rowValue: string,
  colAxis: string,
  colValue: string,
): Build[] {
  return children
    .filter(
      (c) =>
        c.matrixValues?.[rowAxis] === rowValue &&
        c.matrixValues?.[colAxis] === colValue,
    )
    .sort((a, b) => b.startedAt - a.startedAt);
}

function statusBg(status: BuildStatus): string {
  switch (status) {
    case 'success':
      return 'border-emerald-700 bg-emerald-950/40 text-emerald-200 hover:border-emerald-500';
    case 'failed':
      return 'border-rose-700 bg-rose-950/40 text-rose-200 hover:border-rose-500';
    case 'running':
      return 'border-amber-700 bg-amber-950/40 text-amber-200 hover:border-amber-500';
    case 'pending':
      return 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500';
    case 'cancelled':
      return 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500';
    default:
      return 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500';
  }
}

function ChildCell({
  child,
  onOpen,
  compact,
}: {
  child: Build;
  onOpen: (id: string) => void;
  compact?: boolean;
}) {
  const StatusIcon = statusIcon(child.status);
  return (
    <button
      type="button"
      onClick={() => onOpen(child.id)}
      className={cn(
        'focusable group flex w-full flex-col items-start gap-0.5 rounded-md border px-2 py-1.5 text-left transition-colors',
        statusBg(child.status),
        compact && 'py-1',
      )}
      title={`${child.matrixLabel ?? ''} — ${statusLabel(child.status)} (${child.id.slice(0, 8)})`}
    >
      <span className="flex w-full items-center gap-1.5 text-[10px] uppercase tracking-wider opacity-80">
        <StatusIcon
          size={10}
          className={statusIconAnimationClass(child.status)}
          aria-hidden="true"
        />
        {child.status}
      </span>
      {child.matrixLabel && !compact && (
        <span className="block w-full truncate font-mono text-[11px]">
          {child.matrixLabel}
        </span>
      )}
      <span className="block w-full truncate font-mono text-[10px] opacity-60">
        {child.id.slice(0, 8)}
      </span>
    </button>
  );
}

export function MatrixRunSummary({
  parent,
  children,
  onOpenChild,
  onRerunFailed,
  rerunning,
}: Props) {
  const grid = useMemo(() => pickAxesForGrid(children), [children]);
  const rowValues = useMemo(
    () => (grid ? axisValues(children, grid.rowAxis) : []),
    [children, grid],
  );
  const colValues = useMemo(
    () => (grid ? axisValues(children, grid.colAxis) : []),
    [children, grid],
  );

  const tally = useMemo(() => {
    let success = 0;
    let failed = 0;
    let running = 0;
    let cancelled = 0;
    let pending = 0;
    for (const c of children) {
      if (c.status === 'success') success += 1;
      else if (c.status === 'failed') failed += 1;
      else if (c.status === 'running') running += 1;
      else if (c.status === 'cancelled') cancelled += 1;
      else if (c.status === 'pending') pending += 1;
    }
    return { success, failed, running, cancelled, pending };
  }, [children]);

  const hasFailures = tally.failed > 0 || tally.cancelled > 0;

  if (children.length === 0) {
    return (
      <div className="border-b border-slate-800 bg-slate-900/40 px-3 py-4 text-sm text-slate-400 sm:px-6">
        Matrix has no children yet — children may still be queueing.
      </div>
    );
  }

  return (
    <div className="border-b border-slate-800 bg-slate-900/40 px-3 py-3 sm:px-6">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold text-slate-200">
          Matrix run · {children.length} cell{children.length === 1 ? '' : 's'}
        </h2>
        <div className="flex items-center gap-1.5 text-[11px]">
          {tally.success > 0 && (
            <span className="rounded-md bg-emerald-950/50 px-1.5 py-0.5 text-emerald-300">
              {tally.success} ok
            </span>
          )}
          {tally.failed > 0 && (
            <span className="rounded-md bg-rose-950/50 px-1.5 py-0.5 text-rose-300">
              {tally.failed} failed
            </span>
          )}
          {tally.running > 0 && (
            <span className="rounded-md bg-amber-950/50 px-1.5 py-0.5 text-amber-300">
              {tally.running} running
            </span>
          )}
          {tally.pending > 0 && (
            <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-slate-300">
              {tally.pending} pending
            </span>
          )}
          {tally.cancelled > 0 && (
            <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-slate-400">
              {tally.cancelled} cancelled
            </span>
          )}
        </div>
        <div className="ml-auto">
          <button
            type="button"
            onClick={onRerunFailed}
            disabled={!hasFailures || rerunning || parent.status === 'running'}
            className="focusable inline-flex items-center gap-1 rounded-md border border-amber-700/60 px-2 py-1 text-xs text-amber-300 hover:border-amber-500 hover:text-amber-200 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
            title={
              hasFailures
                ? 'Rerun only the cells that failed or were cancelled'
                : 'No failed cells to rerun'
            }
          >
            <RotateCw
              size={11}
              className={rerunning ? 'animate-spin' : undefined}
              aria-hidden="true"
            />
            {rerunning ? 'Spawning…' : 'Rerun failed cells'}
          </button>
        </div>
      </div>

      {grid ? (
        // Two-axis cross-product table. Row axis labels on the left, column
        // axis labels across the top; cells contain ChildCell stacks.
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-1 text-xs">
            <thead>
              <tr>
                <th className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                  <span className="font-mono text-slate-400">{grid.rowAxis}</span>
                  {' / '}
                  <span className="font-mono text-slate-400">{grid.colAxis}</span>
                </th>
                {colValues.map((cv) => (
                  <th
                    key={cv}
                    className="px-1 text-center text-[10px] uppercase tracking-wider text-slate-400"
                  >
                    {cv}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowValues.map((rv) => (
                <tr key={rv}>
                  <th
                    scope="row"
                    className="px-1 text-left text-[11px] font-mono text-slate-300"
                  >
                    {rv}
                  </th>
                  {colValues.map((cv) => {
                    const cellChildren = childrenForCell(
                      children,
                      grid.rowAxis,
                      rv,
                      grid.colAxis,
                      cv,
                    );
                    if (cellChildren.length === 0) {
                      return (
                        <td key={cv} className="min-w-[140px]">
                          <span className="block rounded-md border border-dashed border-slate-800 px-2 py-2 text-center text-[10px] text-slate-500">
                            —
                          </span>
                        </td>
                      );
                    }
                    return (
                      <td key={cv} className="min-w-[140px] space-y-1 align-top">
                        {cellChildren.map((c, idx) => (
                          <div
                            key={c.id}
                            className={cn(idx > 0 && 'opacity-60')}
                            title={
                              idx > 0
                                ? `Earlier pass (kept after rerun)`
                                : undefined
                            }
                          >
                            <ChildCell
                              child={c}
                              onOpen={onOpenChild}
                              compact={idx > 0}
                            />
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        // 1-axis or 3+ axes — flat grid of cells.
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {children.map((c) => (
            <ChildCell key={c.id} child={c} onOpen={onOpenChild} />
          ))}
        </div>
      )}
    </div>
  );
}
