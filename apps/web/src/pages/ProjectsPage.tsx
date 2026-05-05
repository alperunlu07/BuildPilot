import { Folder, Plus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useStore } from '../store/store';

interface Props {
  onAdd(): void;
}

export function ProjectsPage({ onAdd }: Props) {
  const projects = useStore((s) => s.projects);
  const setView = useStore((s) => s.setView);

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
        <div className="rounded-lg border border-dashed border-slate-800 bg-slate-900/40 p-10 text-center text-slate-400">
          <Folder className="mx-auto mb-2 text-slate-600" size={28} />
          No projects yet. Add a local git repository to start watching it.
        </div>
      ) : (
        <ul className="space-y-2">
          {projects.map((p) => (
            <li
              key={p.id}
              className="cursor-pointer rounded-md border border-slate-800 bg-slate-900/60 px-4 py-3 hover:border-sky-700"
              onClick={() => setView({ type: 'project', id: p.id })}
            >
              <div className="flex items-baseline justify-between">
                <h3 className="text-base font-medium text-slate-100">{p.name}</h3>
                <span className="text-[11px] text-slate-500">
                  added {formatDistanceToNow(p.createdAt, { addSuffix: true })}
                </span>
              </div>
              <code className="mt-1 block truncate text-[11px] text-slate-500">{p.path}</code>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-400">
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
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
