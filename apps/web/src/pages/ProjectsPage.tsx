import { Folder, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../store/store';
import { BuildSparkline } from '../components/BuildSparkline';
import { Time } from '../lib/formatDate';

interface Props {
  onAdd(): void;
}

export function ProjectsPage({ onAdd }: Props) {
  const projects = useStore((s) => s.projects);
  const setView = useStore((s) => s.setView);
  const softDeleteProject = useStore((s) => s.softDeleteProject);

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Projects</h1>
          <p className="mt-1 text-sm text-slate-400">
            Registered git repositories. BuildPilot polls each project's pipelines for new commits.
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
        >
          <Plus size={14} /> Add project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-800 bg-slate-900/40 p-10 text-center">
          <Folder className="mx-auto mb-3 text-slate-600" size={36} />
          <div className="text-base font-medium text-slate-200">No projects yet</div>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
            BuildPilot watches local git repositories and runs pipelines on every new
            commit. Point it at a folder to start.
          </p>
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              onClick={onAdd}
              className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-sky-500"
            >
              <Plus size={14} /> Add your first project
            </button>
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {projects.map((p) => (
            <li
              key={p.id}
              className="group relative cursor-pointer rounded-md border border-slate-800 bg-slate-900/60 px-4 py-3 hover:border-sky-700"
              onClick={() => setView({ type: 'project', id: p.id })}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  softDeleteProject(p.id);
                }}
                className="absolute right-3 top-3 rounded-md border border-transparent p-1 text-slate-500 opacity-0 transition-opacity hover:border-rose-700 hover:text-rose-400 group-hover:opacity-100"
                title="Remove this project"
              >
                <Trash2 size={14} />
              </button>
              <div className="flex items-baseline justify-between pr-8">
                <h3 className="text-base font-medium text-slate-100">{p.name}</h3>
                <Time
                  ts={p.createdAt}
                  prefix="added"
                  className="text-[11px] text-slate-500"
                />
              </div>
              <code className="mt-1 block truncate text-[11px] text-slate-500">{p.path}</code>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                <span className="rounded-md bg-slate-800 px-2 py-0.5">
                  default:{' '}
                  <span className="font-mono text-emerald-400">{p.defaultBranch}</span>
                </span>
                {p.watchedBranches.length > 0 && (
                  <span className="rounded-md bg-slate-800 px-2 py-0.5">
                    {p.watchedBranches.length} branch
                    {p.watchedBranches.length === 1 ? '' : 'es'}
                  </span>
                )}
                {p.lastBuildSha && (
                  <span className="rounded-md bg-slate-800 px-2 py-0.5">
                    last build:{' '}
                    <span className="font-mono text-sky-400">
                      {p.lastBuildSha.slice(0, 7)}
                    </span>
                  </span>
                )}
                <span className="ml-auto" onClick={(e) => e.stopPropagation()}>
                  <BuildSparkline projectId={p.id} />
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
