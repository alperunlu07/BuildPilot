import { useEffect, useState } from 'react';
import { AlertTriangle, Trash2, Undo2, X } from 'lucide-react';
import { useStore } from '../store/store';

// Shows one toast per pending soft-delete with a countdown bar + UNDO
// button. The store fires the real API call once the timer elapses.
export function UndoToast() {
  const pending = useStore((s) => s.pendingDeletions);
  const undoDeletion = useStore((s) => s.undoDeletion);
  const errors = useStore((s) => s.errorToasts);
  const dismissError = useStore((s) => s.dismissError);
  // Tick so the progress bar can animate. 100ms is fine — 50 frames per
  // toast lifetime feels smooth without being expensive.
  const [, setTick] = useState(0);

  useEffect(() => {
    if (pending.length === 0) return;
    const id = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(id);
  }, [pending.length]);

  if (pending.length === 0 && errors.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-2 left-1/2 z-40 flex w-full max-w-[calc(100vw-16px)] -translate-x-1/2 flex-col items-center gap-2 px-2 sm:bottom-4 sm:max-w-none sm:px-0">
      {errors.map((e) => (
        <div
          key={e.id}
          // Responsive overhaul Faz 2 — fluid width on phones, 420 sm+.
          className="pointer-events-auto flex w-full max-w-[420px] items-start gap-3 rounded-lg border border-rose-700/60 bg-bg-panel px-4 py-3 shadow-xl ring-1 ring-rose-500/10 sm:w-[420px]"
        >
          <div className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-500/15 text-rose-300">
            <AlertTriangle size={13} />
          </div>
          <div className="min-w-0 flex-1 text-sm text-text-primary">{e.message}</div>
          <button
            type="button"
            onClick={() => dismissError(e.id)}
            className="focusable rounded text-text-muted hover:text-text-secondary"
            aria-label="Dismiss error toast"
          >
            <X size={13} />
          </button>
        </div>
      ))}
      {pending.map((d) => {
        const remaining = Math.max(0, d.expiresAt - Date.now());
        const total = 5000;
        const pct = Math.max(0, Math.min(100, (remaining / total) * 100));
        const seconds = Math.ceil(remaining / 1000);
        return (
          <div
            key={d.id}
            // Responsive overhaul Faz 2 — fluid width on phones, 420 sm+.
            className="pointer-events-auto w-full max-w-[420px] overflow-hidden rounded-lg border border-rose-700/60 bg-bg-panel shadow-xl ring-1 ring-rose-500/10 sm:w-[420px]"
          >
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-500/15 text-rose-300">
                <Trash2 size={14} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-text-primary">
                  {d.kind === 'project' ? 'Project' : 'Pipeline'} deleted
                </div>
                <div className="truncate text-xs text-text-muted">
                  <span className="text-text-primary">{d.label}</span>
                  <span className="mx-1 text-text-muted">·</span>
                  <span>removing in {seconds}s</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => undoDeletion(d.id)}
                className="focusable inline-flex items-center gap-1.5 rounded-md border border-border-subtle px-2.5 py-1 text-xs font-medium text-text-primary hover:border-emerald-500 hover:text-emerald-300"
              >
                <Undo2 size={12} /> Undo
              </button>
            </div>
            <div className="h-0.5 bg-bg-elevated">
              <div
                className="h-full bg-rose-500/70 motion-safe:transition-[width] motion-safe:duration-100 motion-safe:ease-linear"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
