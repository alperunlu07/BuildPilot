import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  ChevronRight,
  GitBranch,
  Hammer,
  Plus,
  Trash2,
} from 'lucide-react';
import type { Commit, Pipeline } from '@buildpilot/shared-types';
import { useStore } from '../store/store';
import { api } from '../lib/api';
import { CommitItem } from '../components/CommitItem';
import { CreatePipelineDialog } from '../components/CreatePipelineDialog';

interface Props {
  projectId: string;
}

export function ProjectDetailPage({ projectId }: Props) {
  const project = useStore((s) => s.projects.find((p) => p.id === projectId));
  const allPipelines = useStore((s) => s.pipelines);
  const allBuilds = useStore((s) => s.builds);
  const pipelines = useMemo(
    () => allPipelines.filter((p) => p.projectId === projectId),
    [allPipelines, projectId],
  );
  const builds = useMemo(
    () => allBuilds.filter((b) => b.projectId === projectId),
    [allBuilds, projectId],
  );
  const setView = useStore((s) => s.setView);
  const removeProject = useStore((s) => s.removeProject);
  const triggerBuild = useStore((s) => s.triggerBuild);
  const loadBuilds = useStore((s) => s.loadBuilds);

  const [branch, setBranch] = useState<string>('');
  const [commits, setCommits] = useState<Commit[]>([]);
  const [pulling, setPulling] = useState(false);
  const [openCreate, setOpenCreate] = useState(false);

  useEffect(() => {
    if (!project) return;
    setBranch(project.defaultBranch);
  }, [project?.id]);

  useEffect(() => {
    if (!project || !branch) return;
    let alive = true;
    api
      .commits(project.id, { branch, limit: 50 })
      .then((c) => {
        if (alive) setCommits(c);
      })
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, [project?.id, branch]);

  useEffect(() => {
    if (!project) return;
    void loadBuilds({ projectId: project.id });
  }, [project?.id, loadBuilds]);

  if (!project) return null;

  // Highlight commits that arrived after the most recently built SHA across all
  // pipelines for this project. We pick the most recent successful build's SHA.
  const lastSuccessfulSha = builds.find((b) => b.status === 'success')?.triggerSha;
  const highlightStartIdx =
    lastSuccessfulSha == null
      ? -1
      : commits.findIndex((c) => c.sha === lastSuccessfulSha);
  const highlightShas = new Set<string>(
    highlightStartIdx > 0 ? commits.slice(0, highlightStartIdx).map((c) => c.sha) : [],
  );

  const onPull = async () => {
    setPulling(true);
    try {
      await api.pullProject(project.id);
      const refreshed = await api.commits(project.id, { branch, limit: 50 });
      setCommits(refreshed);
    } finally {
      setPulling(false);
    }
  };

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col p-6">
      <header className="mb-4">
        <button
          type="button"
          onClick={() => setView({ type: 'projects' })}
          className="mb-2 text-[11px] uppercase tracking-wider text-slate-500 hover:text-slate-300"
        >
          ← Projects
        </button>
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-semibold text-slate-100">{project.name}</h1>
          <button
            type="button"
            onClick={async () => {
              if (confirm(`Remove "${project.name}" from BuildPilot?`)) {
                await removeProject(project.id);
              }
            }}
            className="text-[11px] text-rose-400 hover:text-rose-300"
            title="Remove project"
          >
            <Trash2 size={13} />
          </button>
        </div>
        <code className="mt-1 block text-[11px] text-slate-500">{project.path}</code>
      </header>

      <section className="mb-4 rounded-md border border-slate-800 bg-slate-900/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch size={14} className="text-emerald-400" />
            <select
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm font-mono text-slate-100 focus:border-sky-500 focus:outline-none"
            >
              {project.watchedBranches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            {highlightShas.size > 0 && (
              <span className="rounded-md bg-amber-950/50 px-2 py-0.5 text-[11px] text-amber-300">
                {highlightShas.size} commit{highlightShas.size === 1 ? '' : 's'} since last build
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onPull}
            disabled={pulling}
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-200 hover:border-emerald-500 hover:text-emerald-400 disabled:opacity-50"
          >
            <ArrowDownToLine size={12} /> {pulling ? 'Pulling…' : 'Pull'}
          </button>
        </div>

        {commits.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-500">No commits found.</div>
        ) : (
          <ul className="space-y-1.5">
            {commits.map((c) => (
              <CommitItem key={c.sha} commit={c} highlight={highlightShas.has(c.sha)} />
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-md border border-slate-800 bg-slate-900/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">Pipelines</h2>
          <button
            type="button"
            onClick={() => setOpenCreate(true)}
            className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-500"
          >
            <Plus size={12} /> New pipeline
          </button>
        </div>

        {pipelines.length === 0 ? (
          <div className="py-4 text-sm text-slate-500">
            No pipelines yet. Create one to start watching commits and running builds.
          </div>
        ) : (
          <ul className="space-y-2">
            {pipelines.map((pl) => (
              <PipelineRow
                key={pl.id}
                pipeline={pl}
                onOpen={() => setView({ type: 'pipeline', id: pl.id })}
                onRun={() => triggerBuild(pl.id)}
              />
            ))}
          </ul>
        )}
      </section>

      <CreatePipelineDialog
        open={openCreate}
        projectId={project.id}
        defaultBranch={project.defaultBranch}
        onClose={() => setOpenCreate(false)}
        onCreated={(p) => setView({ type: 'pipeline', id: p.id })}
      />
    </div>
  );
}

function PipelineRow({
  pipeline,
  onOpen,
  onRun,
}: {
  pipeline: Pipeline;
  onOpen(): void;
  onRun(): void;
}) {
  return (
    <li className="rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2.5">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onOpen} className="flex-1 text-left">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
            {pipeline.name}
            <ChevronRight size={12} className="text-slate-500" />
          </div>
          <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-slate-500">
            <span>
              watch:{' '}
              <span className="font-mono text-emerald-400">{pipeline.watch.branch}</span>
            </span>
            <span>·</span>
            <span>{pipeline.nodes.length} steps</span>
            <span>·</span>
            <span>every {pipeline.watch.intervalSec}s</span>
            {pipeline.lastBuiltSha && (
              <>
                <span>·</span>
                <span>
                  last:{' '}
                  <span className="font-mono text-sky-400">
                    {pipeline.lastBuiltSha.slice(0, 7)}
                  </span>
                </span>
              </>
            )}
          </div>
        </button>
        <button
          type="button"
          onClick={onRun}
          className="ml-3 inline-flex items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-200 hover:border-sky-500 hover:text-sky-400"
        >
          <Hammer size={12} /> Run
        </button>
      </div>
    </li>
  );
}
