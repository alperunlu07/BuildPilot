import { Plus, Folder, GitBranch, History, Server, Settings, Trash2 } from 'lucide-react';
import { useStore } from '../store/store';
import { cn } from '../lib/cn';

interface Props {
  onAddProject(): void;
  onManageHosts(): void;
}

export function Sidebar({ onAddProject, onManageHosts }: Props) {
  const projects = useStore((s) => s.projects);
  const pipelines = useStore((s) => s.pipelines);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const removeProject = useStore((s) => s.removeProject);
  const deletePipelineAction = useStore((s) => s.deletePipeline);
  const requestConfirmation = useStore((s) => s.requestConfirmation);

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-slate-800 bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <button
          type="button"
          onClick={() => setView({ type: 'projects' })}
          className="text-left"
        >
          <div className="text-base font-semibold tracking-tight text-slate-100">BuildPilot</div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500">Local CI/CD</div>
        </button>
        <button
          type="button"
          onClick={onAddProject}
          className="rounded-md border border-slate-700 p-1.5 text-slate-300 hover:border-sky-500 hover:text-sky-400"
          title="Add project"
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="space-y-0.5 px-2 pt-3">
        <button
          type="button"
          onClick={() => setView({ type: 'builds' })}
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
            view.type === 'builds' || view.type === 'build'
              ? 'bg-slate-800 text-slate-100'
              : 'text-slate-300 hover:bg-slate-800/60',
          )}
        >
          <History size={14} className="text-amber-400" />
          <span>Builds &amp; Logs</span>
        </button>
        <button
          type="button"
          onClick={onManageHosts}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-300 hover:bg-slate-800/60"
          title="Manage saved SSH hosts (used by Remote SSH / SFTP / Mac steps)"
        >
          <Server size={14} className="text-slate-400" />
          <span>SSH Hosts</span>
        </button>
        <button
          type="button"
          onClick={() => setView({ type: 'settings' })}
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
            view.type === 'settings'
              ? 'bg-slate-800 text-slate-100'
              : 'text-slate-300 hover:bg-slate-800/60',
          )}
          title="Server-wide settings (Telegram integration, etc.)"
        >
          <Settings size={14} className="text-slate-400" />
          <span>Settings</span>
        </button>
      </div>

      <div className="px-3 pt-3 text-[11px] uppercase tracking-wider text-slate-500">Projects</div>
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {projects.length === 0 && (
          <div className="px-3 py-6 text-sm text-slate-500">
            No projects. Click <span className="text-slate-300">+</span> to add one.
          </div>
        )}
        <ul className="space-y-0.5">
          {projects.map((p) => {
            const active = view.type === 'project' && view.id === p.id;
            const projectPipelines = pipelines.filter((pl) => pl.projectId === p.id);
            return (
              <li key={p.id}>
                <div
                  className={cn(
                    'group flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-sm',
                    active
                      ? 'bg-slate-800 text-slate-100'
                      : 'text-slate-300 hover:bg-slate-800/60',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setView({ type: 'project', id: p.id })}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <Folder size={14} className="text-sky-400" />
                    <span className="truncate">{p.name}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      requestConfirmation({
                        title: `Remove project "${p.name}"?`,
                        body:
                          'Pipelines belonging to this project will also be deleted. ' +
                          'Build history is kept.',
                        variant: 'destructive',
                        confirmLabel: 'Remove project',
                        onConfirm: () => removeProject(p.id),
                      });
                    }}
                    className="rounded p-0.5 text-slate-500 opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100"
                    title="Remove this project"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                {projectPipelines.length > 0 && (
                  <ul className="ml-6 mt-0.5 space-y-0.5">
                    {projectPipelines.map((pl) => {
                      const plActive = view.type === 'pipeline' && view.id === pl.id;
                      return (
                        <li key={pl.id}>
                          <div
                            className={cn(
                              'group flex w-full items-center gap-1 rounded-md px-2 py-1 text-left text-xs',
                              plActive
                                ? 'bg-slate-800 text-slate-100'
                                : 'text-slate-400 hover:bg-slate-800/60',
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => setView({ type: 'pipeline', id: pl.id })}
                              className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            >
                              <GitBranch size={12} className="text-emerald-400" />
                              <span className="truncate">{pl.name}</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                requestConfirmation({
                                  title: `Delete pipeline "${pl.name}"?`,
                                  body: "Build history for this pipeline is kept; only the pipeline definition is removed.",
                                  variant: 'destructive',
                                  confirmLabel: 'Delete pipeline',
                                  onConfirm: () => deletePipelineAction(pl.id),
                                });
                              }}
                              className="rounded p-0.5 text-slate-500 opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100"
                              title="Delete this pipeline"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
