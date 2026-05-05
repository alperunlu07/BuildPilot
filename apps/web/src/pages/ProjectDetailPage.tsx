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
import { computeGraph } from '../lib/graph';
import { cn } from '../lib/cn';

interface Props {
  projectId: string;
}

const ALL_BRANCHES = '*';

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

  const [currentBranch, setCurrentBranch] = useState<string>('');
  const [headSha, setHeadSha] = useState<string>('');
  const [browseBranch, setBrowseBranch] = useState<string>(ALL_BRANCHES);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [pulling, setPulling] = useState(false);
  const [openCreate, setOpenCreate] = useState(false);

  // Pull the actual git HEAD branch + sha so we can mark the commit and the chip.
  useEffect(() => {
    if (!project) return;
    let alive = true;
    api
      .currentBranch(project.id)
      .then((r) => {
        if (!alive) return;
        setCurrentBranch(r.branch);
        if (r.sha) setHeadSha(r.sha);
      })
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, [project?.id]);

  // Fetch commits when the browse mode changes.
  useEffect(() => {
    if (!project) return;
    let alive = true;
    const opts =
      browseBranch === ALL_BRANCHES
        ? { all: true, limit: 200 }
        : { branch: browseBranch, limit: 200 };
    api
      .commits(project.id, opts)
      .then((c) => {
        if (alive) setCommits(c);
      })
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, [project?.id, browseBranch]);

  useEffect(() => {
    if (!project) return;
    void loadBuilds({ projectId: project.id });
  }, [project?.id, loadBuilds]);

  const layout = useMemo(() => computeGraph(commits), [commits]);

  const lastSuccessfulSha = useMemo(
    () => builds.find((b) => b.status === 'success')?.triggerSha,
    [builds],
  );
  const highlightShas = useMemo(() => {
    const startIdx =
      lastSuccessfulSha == null ? -1 : commits.findIndex((c) => c.sha === lastSuccessfulSha);
    return new Set<string>(
      startIdx > 0 ? commits.slice(0, startIdx).map((c) => c.sha) : [],
    );
  }, [commits, lastSuccessfulSha]);

  if (!project) return null;

  const onPull = async () => {
    setPulling(true);
    try {
      await api.pullProject(project.id);
      const opts =
        browseBranch === ALL_BRANCHES
          ? { all: true as const, limit: 200 }
          : { branch: browseBranch, limit: 200 };
      const refreshed = await api.commits(project.id, opts);
      setCommits(refreshed);
      const cb = await api.currentBranch(project.id).catch(() => null);
      if (cb) {
        if (cb.branch) setCurrentBranch(cb.branch);
        if (cb.sha) setHeadSha(cb.sha);
      }
    } finally {
      setPulling(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* HEADER */}
      <header className="border-b border-slate-800 bg-slate-900/40 px-6 py-3">
        <button
          type="button"
          onClick={() => setView({ type: 'projects' })}
          className="text-[11px] uppercase tracking-wider text-slate-500 hover:text-slate-300"
        >
          ← Projects
        </button>
        <div className="mt-1 flex items-baseline justify-between">
          <h1 className="text-lg font-semibold text-slate-100">{project.name}</h1>
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
        <code className="mt-0.5 block text-[11px] text-slate-500">{project.path}</code>
      </header>

      {/* BRANCH STRIP */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-950/60 px-6 py-2.5">
        {currentBranch ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-700/50 bg-emerald-950/40 px-2.5 py-1 text-xs text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            on{' '}
            <code className="font-mono font-semibold text-emerald-200">{currentBranch}</code>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-600" />
            checking…
          </span>
        )}

        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <GitBranch size={12} className="text-slate-500" />
          browse
          <select
            value={browseBranch}
            onChange={(e) => setBrowseBranch(e.target.value)}
            className="ml-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
          >
            <option value={ALL_BRANCHES}>(all branches)</option>
            {project.watchedBranches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </span>

        {browseBranch !== ALL_BRANCHES &&
          currentBranch &&
          browseBranch !== currentBranch && (
            <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-400">
              different branch
            </span>
          )}

        {highlightShas.size > 0 && (
          <span className="rounded-md bg-amber-950/50 px-2 py-0.5 text-[11px] text-amber-300">
            {highlightShas.size} commit{highlightShas.size === 1 ? '' : 's'} since last build
          </span>
        )}

        <button
          type="button"
          onClick={onPull}
          disabled={pulling}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-200 hover:border-emerald-500 hover:text-emerald-400 disabled:opacity-50"
        >
          <ArrowDownToLine size={12} /> {pulling ? 'Pulling…' : 'Pull'}
        </button>
      </div>

      {/* TWO-COLUMN BODY */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* Commits — scrollable */}
        <div className="scrollbar-thin min-h-0 overflow-y-auto border-r border-slate-800 px-2 py-2">
          {commits.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">No commits found.</div>
          ) : (
            <ol className="relative">
              {layout.rows.map((r, idx) => (
                <CommitItem
                  key={r.sha}
                  row={r}
                  width={layout.width}
                  isFirst={idx === 0}
                  isLast={idx === layout.rows.length - 1}
                  isHead={r.sha === headSha}
                  highlight={highlightShas.has(r.sha)}
                />
              ))}
            </ol>
          )}
        </div>

        {/* Pipelines — sticky panel */}
        <aside className="scrollbar-thin min-h-0 overflow-y-auto bg-slate-950/30 px-4 py-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
              Pipelines
            </h2>
            <button
              type="button"
              onClick={() => setOpenCreate(true)}
              className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2 py-1 text-xs font-medium text-white hover:bg-sky-500"
            >
              <Plus size={12} /> New
            </button>
          </div>

          {pipelines.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-700 bg-slate-900/40 p-4 text-center text-xs text-slate-500">
              No pipelines yet. Create one to start watching commits and running builds.
            </div>
          ) : (
            <ul className="space-y-2">
              {pipelines.map((pl) => (
                <PipelineRow
                  key={pl.id}
                  pipeline={pl}
                  watchActive={pl.watch.branch === currentBranch}
                  onOpen={() => setView({ type: 'pipeline', id: pl.id })}
                  onRun={() => triggerBuild(pl.id)}
                />
              ))}
            </ul>
          )}
        </aside>
      </div>

      <CreatePipelineDialog
        open={openCreate}
        projectId={project.id}
        defaultBranch={currentBranch || project.defaultBranch}
        onClose={() => setOpenCreate(false)}
        onCreated={(p) => setView({ type: 'pipeline', id: p.id })}
      />
    </div>
  );
}

function PipelineRow({
  pipeline,
  watchActive,
  onOpen,
  onRun,
}: {
  pipeline: Pipeline;
  watchActive: boolean;
  onOpen(): void;
  onRun(): void;
}) {
  return (
    <li className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
            <span className="truncate">{pipeline.name}</span>
            <ChevronRight size={12} className="shrink-0 text-slate-500" />
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <span
              className={cn(
                'rounded-md px-1.5 py-0.5 text-[10px] font-mono',
                watchActive
                  ? 'bg-emerald-950/50 text-emerald-300'
                  : 'bg-slate-800 text-slate-400',
              )}
              title={watchActive ? 'matches current branch' : 'different branch'}
            >
              {pipeline.watch.branch}
            </span>
            <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
              {pipeline.nodes.length} step{pipeline.nodes.length === 1 ? '' : 's'}
            </span>
            <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
              {pipeline.watch.intervalSec}s
            </span>
            {pipeline.lastBuiltSha && (
              <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                last:{' '}
                <code className="font-mono text-sky-400">
                  {pipeline.lastBuiltSha.slice(0, 7)}
                </code>
              </span>
            )}
          </div>
        </button>
        <button
          type="button"
          onClick={onRun}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:border-sky-500 hover:text-sky-400"
          title="Trigger build now"
        >
          <Hammer size={11} /> Run
        </button>
      </div>
    </li>
  );
}
