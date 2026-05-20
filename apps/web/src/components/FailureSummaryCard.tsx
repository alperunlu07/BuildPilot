import { useMemo } from 'react';
import { AlertTriangle, Sparkles, RotateCcw } from 'lucide-react';
import type { BuildLogEntry, StepType } from '@buildpilot/shared-types';
import { cn } from '../lib/cn';

interface Props {
  entries: BuildLogEntry[];
  nodeLabel?(nodeId: string, stepType: StepType | null): string;
  onRetry?(nodeId: string): void;
  onJumpToNode?(nodeId: string): void;
}

interface FailureSummary {
  nodeId: string;
  stepType: StepType | null;
  failureMessage: string;
  tailLines: BuildLogEntry[];
  aiFix: { messages: string[]; ran: boolean } | null;
}

// Surface the most recent failure in a build with the last few lines of
// log context and any AI auto-fix activity that ran for the same node.
export function FailureSummaryCard({ entries, nodeLabel, onRetry, onJumpToNode }: Props) {
  const summary = useMemo<FailureSummary | null>(() => {
    let failureIdx = -1;
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i]!;
      if (e.level === 'failure' && e.nodeId) {
        failureIdx = i;
        break;
      }
    }
    if (failureIdx === -1) return null;
    const failure = entries[failureIdx]!;
    const nodeId = failure.nodeId!;

    // Last 5 entries for the failed node leading up to and including the
    // failure line — gives just enough context to read the actual error.
    const nodeEntries = entries.filter((e) => e.nodeId === nodeId);
    const failurePos = nodeEntries.findIndex((e) => e === failure);
    const start = Math.max(0, failurePos - 4);
    const tailLines = nodeEntries.slice(start, failurePos + 1);

    // AI auto-fix surfaces as system / failure entries on the same node
    // mentioning the AI flow ("invoking AI fix", "retry … after AI fix").
    const aiMessages = nodeEntries
      .map((e) => e.message)
      .filter((m) => /AI fix/i.test(m) || /after AI fix/i.test(m));

    return {
      nodeId,
      stepType: failure.stepType,
      failureMessage: failure.message,
      tailLines,
      aiFix: aiMessages.length > 0 ? { messages: aiMessages, ran: true } : null,
    };
  }, [entries]);

  if (!summary) return null;

  const label = nodeLabel
    ? nodeLabel(summary.nodeId, summary.stepType)
    : `${summary.stepType ?? '?'} · ${summary.nodeId.slice(0, 8)}`;

  return (
    <div className="border-b border-rose-900/40 bg-rose-950/20 px-3 py-3 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="mt-0.5 shrink-0 rounded-md bg-rose-950/60 p-1.5 text-rose-300">
          <AlertTriangle size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-300">
              Failed step
            </span>
            <button
              type="button"
              onClick={() => onJumpToNode?.(summary.nodeId)}
              className="font-mono text-sm text-bp-text-primary hover:text-accent-hover"
              title="Filter log to this step"
            >
              {label}
            </button>
          </div>
          <p className="mt-1 text-[12px] text-rose-200">{summary.failureMessage}</p>

          <div className="mt-2 rounded-md border border-rose-900/40 bg-bp-surface-0/60 p-2 font-mono text-[11px] leading-relaxed text-bp-text-secondary">
            {summary.tailLines.map((e) => (
              <div key={e.seq} className="flex gap-2">
                <span className="shrink-0 text-bp-text-muted">
                  {new Date(e.ts).toLocaleTimeString()}
                </span>
                <span
                  className={cn(
                    'min-w-0 break-words',
                    e.level === 'failure' && 'text-rose-300',
                    e.level === 'stderr' && 'text-amber-200',
                    e.level === 'success' && 'text-emerald-300',
                  )}
                >
                  {e.message}
                </span>
              </div>
            ))}
          </div>

          {summary.aiFix && (
            <div className="mt-2 rounded-md border border-sky-900/40 bg-sky-950/30 p-2 text-[11px] text-sky-200">
              <div className="mb-1 inline-flex items-center gap-1.5 font-semibold uppercase tracking-wider text-accent-hover">
                <Sparkles size={12} /> AI auto-fix
              </div>
              <ul className="space-y-0.5 font-mono">
                {summary.aiFix.messages.slice(-3).map((m, i) => (
                  <li key={i} className="break-words text-bp-text-secondary">
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={() => onRetry(summary.nodeId)}
            className="focusable touch-target inline-flex shrink-0 items-center gap-1 self-start rounded-md border border-amber-700/60 px-2 py-1 text-[11px] text-amber-300 hover:border-amber-500 hover:text-amber-200"
            title={`Re-run from the failed step (${summary.nodeId.slice(0, 8)})`}
          >
            <RotateCcw size={11} /> Retry
          </button>
        )}
      </div>
    </div>
  );
}
