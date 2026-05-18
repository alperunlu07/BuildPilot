import { ArrowDownToLine, Hammer, RefreshCw, X } from 'lucide-react';
import { useStore } from '../store/store';
import { api } from '../lib/api';

export function ToastContainer() {
  const toasts = useStore((s) => s.toasts);
  const projects = useStore((s) => s.projects);
  const pipelines = useStore((s) => s.pipelines);
  const dismissToast = useStore((s) => s.dismissToast);
  const triggerBuild = useStore((s) => s.triggerBuild);
  const setView = useStore((s) => s.setView);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-40 flex w-96 flex-col gap-3">
      {toasts.map((t) => {
        const project = projects.find((p) => p.id === t.projectId);
        const pipeline = pipelines.find((p) => p.id === t.pipelineId);

        return (
          <div
            key={t.id}
            className="pointer-events-auto overflow-hidden rounded-lg border border-amber-700/60 bg-slate-900 shadow-xl ring-1 ring-amber-500/10"
          >
            <div className="flex items-start gap-3 border-b border-slate-800 px-4 py-3">
              <div className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
                <Hammer size={14} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-100">
                  {t.commits.length} new commit{t.commits.length === 1 ? '' : 's'}
                </div>
                <div className="text-xs text-slate-400">
                  <span className="text-slate-200">{project?.name ?? 'project'}</span>
                  <span className="mx-1 text-slate-400">·</span>
                  <span className="font-mono text-emerald-400">{t.branch}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                className="focusable touch-target rounded text-slate-400 hover:text-slate-300"
                aria-label="Dismiss new-commit toast"
              >
                <X size={14} />
              </button>
            </div>

            <ul className="max-h-48 overflow-y-auto px-4 py-2 text-[12px]">
              {t.commits.slice(0, 8).map((c) => (
                <li key={c.sha} className="py-1">
                  <code className="mr-2 text-[11px] text-sky-400">{c.shortSha}</code>
                  <span className="text-slate-200">{c.subject}</span>
                </li>
              ))}
              {t.commits.length > 8 && (
                <li className="py-1 text-[11px] text-slate-400">
                  +{t.commits.length - 8} more…
                </li>
              )}
            </ul>

            <div className="flex items-center justify-between gap-2 border-t border-slate-800 bg-slate-950/40 px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  setView({ type: 'project', id: t.projectId });
                  dismissToast(t.id);
                }}
                className="focusable rounded text-[11px] uppercase tracking-wider text-slate-400 hover:text-slate-200"
              >
                Open project
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await api.fetchProject(t.projectId);
                  }}
                  className="focusable inline-flex items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-200 hover:border-sky-500 hover:text-sky-400"
                  title="git fetch --all --prune"
                >
                  <RefreshCw size={12} /> Fetch
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await api.pullProject(t.projectId);
                    dismissToast(t.id);
                  }}
                  className="focusable inline-flex items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-200 hover:border-emerald-500 hover:text-emerald-400"
                >
                  <ArrowDownToLine size={12} /> Pull
                </button>
                {pipeline && (
                  <button
                    type="button"
                    onClick={async () => {
                      await api.pullProject(t.projectId).catch(() => null);
                      await triggerBuild(t.pipelineId);
                      dismissToast(t.id);
                    }}
                    className="focusable inline-flex items-center gap-1 rounded-md bg-sky-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-500"
                  >
                    <Hammer size={12} /> Pull &amp; Build
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
