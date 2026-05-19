import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';

export function formatAbsolute(ts: number | Date | null | undefined): string {
  if (ts === null || ts === undefined) return '—';
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.toLocaleString();
}

export function formatRelative(ts: number | Date | null | undefined): string {
  if (ts === null || ts === undefined) return '—';
  const d = ts instanceof Date ? ts : new Date(ts);
  try {
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return d.toLocaleString();
  }
}

interface TimeProps {
  ts: number | Date | null | undefined;
  // When true, render the absolute timestamp instead of the relative one.
  // Hovering still flips the title attribute, so both forms are reachable.
  absolute?: boolean;
  prefix?: string;
  className?: string;
}

// Refresh interval — re-renders every minute so "3 min ago" stays accurate
// without us paying the cost of a global ticker.
const TICK_MS = 60_000;

export function Time({ ts, absolute = false, prefix, className }: TimeProps) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (ts === null || ts === undefined) return;
    const id = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => clearInterval(id);
  }, [ts]);

  if (ts === null || ts === undefined) {
    return <span className={className}>{prefix ? `${prefix} —` : '—'}</span>;
  }
  const abs = formatAbsolute(ts);
  const rel = formatRelative(ts);
  const label = absolute ? abs : rel;
  const title = absolute ? rel : abs;
  return (
    <time
      className={className}
      title={title}
      dateTime={new Date(ts).toISOString()}
    >
      {prefix ? `${prefix} ${label}` : label}
    </time>
  );
}
