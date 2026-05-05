import { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Commit } from '@buildpilot/shared-types';
import { cn } from '../lib/cn';

interface Props {
  commit: Commit;
  highlight?: boolean;
}

export function CommitItem({ commit, highlight }: Props) {
  const [open, setOpen] = useState(false);
  const hasBody = commit.body.trim().length > 0;

  return (
    <li
      className={cn(
        'rounded-md border px-3 py-2 transition-colors',
        highlight
          ? 'border-amber-700/60 bg-amber-950/20'
          : 'border-slate-800 bg-slate-900/60',
      )}
    >
      <button
        type="button"
        onClick={() => hasBody && setOpen(!open)}
        className={cn(
          'flex w-full items-start gap-2 text-left',
          hasBody ? 'cursor-pointer' : 'cursor-default',
        )}
      >
        {hasBody ? (
          open ? (
            <ChevronDown size={14} className="mt-0.5 shrink-0 text-slate-500" />
          ) : (
            <ChevronRight size={14} className="mt-0.5 shrink-0 text-slate-500" />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <code className="font-mono text-[11px] text-sky-400">{commit.shortSha}</code>
            <span className="truncate text-sm text-slate-100">{commit.subject}</span>
          </div>
          <div className="mt-0.5 flex items-baseline gap-2 text-[11px] text-slate-500">
            <span className="truncate">{commit.author}</span>
            <span>·</span>
            <span>{formatDistanceToNow(commit.date, { addSuffix: true })}</span>
          </div>
        </div>
      </button>
      {open && hasBody && (
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-[12px] text-slate-300">
{commit.body}
        </pre>
      )}
    </li>
  );
}
