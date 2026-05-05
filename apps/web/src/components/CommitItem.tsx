import { useState } from 'react';
import { ChevronRight, ChevronDown, GitMerge } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Commit } from '@buildpilot/shared-types';
import { cn } from '../lib/cn';

interface Props {
  commit: Commit;
  isFirst: boolean;
  isLast: boolean;
  highlight?: boolean;
  isHead?: boolean;
}

export function CommitItem({ commit, isFirst, isLast, highlight, isHead }: Props) {
  const [open, setOpen] = useState(false);
  const isMerge = commit.parents.length >= 2;
  const hasBody = (commit.body ?? '').trim().length > 0;

  return (
    <li
      className={cn(
        'relative flex gap-3 transition-colors',
        highlight && 'bg-amber-950/20',
      )}
    >
      {/* Rail */}
      <div className="relative w-7 shrink-0">
        {/* Top half line — hidden on first row */}
        {!isFirst && (
          <span
            className="absolute left-1/2 top-0 w-px -translate-x-1/2 bg-slate-700"
            style={{ height: '18px' }}
          />
        )}
        {/* Bottom half line — hidden on last row */}
        {!isLast && (
          <span
            className="absolute left-1/2 w-px -translate-x-1/2 bg-slate-700"
            style={{ top: '18px', bottom: 0 }}
          />
        )}
        {/* HEAD pulse halo */}
        {isHead && (
          <span
            className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 h-5 w-5 animate-pulse rounded-full border border-sky-500/60 bg-sky-500/10"
            style={{ top: '18px' }}
          />
        )}
        {/* Dot */}
        <span
          className={cn(
            'absolute left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full',
            isMerge
              ? 'flex h-4 w-4 items-center justify-center border-2 border-amber-500 bg-slate-950 text-amber-400'
              : 'h-2.5 w-2.5 bg-emerald-500',
            highlight && 'ring-2 ring-amber-400/50 ring-offset-2 ring-offset-slate-950',
          )}
          style={{ top: '18px' }}
        >
          {isMerge && <GitMerge size={9} strokeWidth={2.5} />}
        </span>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pb-2 pt-1.5">
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
              <code className="font-mono text-[11px] text-sky-400">{commit.shortSha}</code>
              {isHead && (
                <span className="rounded-sm bg-sky-500/20 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wider text-sky-300">
                  HEAD
                </span>
              )}
              <span className="truncate text-sm text-slate-100">{commit.subject}</span>
            </div>
            <div className="mt-0.5 flex items-baseline gap-2 text-[11px] text-slate-500">
              <span className="truncate">{commit.author}</span>
              <span>·</span>
              <span>{formatDistanceToNow(commit.date, { addSuffix: true })}</span>
              {isMerge && (
                <>
                  <span>·</span>
                  <span className="text-amber-400/80">merge of {commit.parents.length}</span>
                </>
              )}
            </div>
          </div>
        </button>
        {open && hasBody && (
          <pre className="mt-1.5 ml-4 overflow-x-auto whitespace-pre-wrap rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-[12px] text-slate-300">
{commit.body}
          </pre>
        )}
      </div>
    </li>
  );
}
