import {
  Folder,
  GitBranch,
  History,
  Home,
  Monitor,
  Moon,
  Plus,
  Server,
  Settings,
  Star,
  Sun,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  const favorites = useStore((s) => s.favorites);
  const toggleFavoriteProject = useStore((s) => s.toggleFavoriteProject);
  const toggleFavoritePipeline = useStore((s) => s.toggleFavoritePipeline);
  const recents = useStore((s) => s.recents);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const { t } = useTranslation();

  const favProjects = projects.filter((p) => favorites.projectIds.includes(p.id));
  const favPipelines = pipelines.filter((p) => favorites.pipelineIds.includes(p.id));

  function cycleTheme() {
    const next = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';
    setTheme(next);
  }
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;

  return (
    <aside className="density-card flex h-full w-72 shrink-0 flex-col border-r border-slate-800 bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <button
          type="button"
          onClick={() => setView({ type: 'projects' })}
          className="text-left"
        >
          <div className="text-base font-semibold tracking-tight text-slate-100">BuildPilot</div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500">Local CI/CD</div>
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={cycleTheme}
            className="rounded-md border border-slate-700 p-1.5 text-slate-300 hover:border-sky-500 hover:text-sky-400"
            title={`${t('actions.toggleTheme')} (now: ${theme})`}
            aria-label={t('actions.toggleTheme')}
          >
            <ThemeIcon size={14} />
          </button>
          <button
            type="button"
            onClick={onAddProject}
            className="rounded-md border border-slate-700 p-1.5 text-slate-300 hover:border-sky-500 hover:text-sky-400"
            title={t('actions.addProject')}
            aria-label={t('actions.addProject')}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      <div className="space-y-0.5 px-2 pt-3">
        <NavItem
          active={view.type === 'home' || view.type === 'diskUsage'}
          icon={<Home size={14} className="text-sky-400" />}
          label={t('nav.home')}
          onClick={() => setView({ type: 'home' })}
        />
        <NavItem
          active={view.type === 'builds' || view.type === 'build'}
          icon={<History size={14} className="text-amber-400" />}
          label={t('nav.builds')}
          onClick={() => setView({ type: 'builds' })}
        />
        <NavItem
          icon={<Server size={14} className="text-slate-400" />}
          label={t('nav.hosts')}
          onClick={onManageHosts}
          title="Manage saved SSH hosts (used by Remote SSH / SFTP / Mac steps)"
        />
        <NavItem
          active={view.type === 'settings'}
          icon={<Settings size={14} className="text-slate-400" />}
          label={t('nav.settings')}
          onClick={() => setView({ type: 'settings' })}
        />
      </div>

      {(favProjects.length > 0 || favPipelines.length > 0) && (
        <>
          <div className="px-3 pt-3 text-[11px] uppercase tracking-wider text-slate-500">
            {t('nav.favorites')}
          </div>
          <ul className="space-y-0.5 px-2 pb-1">
            {favProjects.map((p) => {
              const active = view.type === 'project' && view.id === p.id;
              return (
                <li key={`fav-p-${p.id}`}>
                  <button
                    type="button"
                    onClick={() => setView({ type: 'project', id: p.id })}
                    className={cn(
                      'density-row flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs',
                      active
                        ? 'bg-slate-800 text-slate-100'
                        : 'text-slate-300 hover:bg-slate-800/60',
                    )}
                  >
                    <Folder size={12} className="text-sky-400" />
                    <span className="truncate">{p.name}</span>
                  </button>
                </li>
              );
            })}
            {favPipelines.map((pl) => {
              const active = view.type === 'pipeline' && view.id === pl.id;
              return (
                <li key={`fav-pl-${pl.id}`}>
                  <button
                    type="button"
                    onClick={() => setView({ type: 'pipeline', id: pl.id })}
                    className={cn(
                      'density-row flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs',
                      active
                        ? 'bg-slate-800 text-slate-100'
                        : 'text-slate-300 hover:bg-slate-800/60',
                    )}
                  >
                    <GitBranch size={12} className="text-emerald-400" />
                    <span className="truncate">{pl.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="px-3 pt-3 text-[11px] uppercase tracking-wider text-slate-500">
        {t('nav.projects')}
      </div>
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
            const isFav = favorites.projectIds.includes(p.id);
            return (
              <li key={p.id}>
                <div
                  className={cn(
                    'group density-row flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-sm',
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
                      toggleFavoriteProject(p.id);
                    }}
                    className={cn(
                      'rounded p-0.5 transition-opacity',
                      isFav
                        ? 'text-amber-400 opacity-100'
                        : 'text-slate-500 opacity-0 hover:text-amber-400 group-hover:opacity-100',
                    )}
                    aria-label={isFav ? 'Unpin project' : 'Pin project'}
                    title={isFav ? 'Unpin project' : 'Pin project'}
                  >
                    <Star size={12} fill={isFav ? 'currentColor' : 'none'} />
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
                    aria-label="Remove project"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                {projectPipelines.length > 0 && (
                  <ul className="ml-6 mt-0.5 space-y-0.5">
                    {projectPipelines.map((pl) => {
                      const plActive = view.type === 'pipeline' && view.id === pl.id;
                      const plFav = favorites.pipelineIds.includes(pl.id);
                      return (
                        <li key={pl.id}>
                          <div
                            className={cn(
                              'group density-row flex w-full items-center gap-1 rounded-md px-2 py-1 text-left text-xs',
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
                                toggleFavoritePipeline(pl.id);
                              }}
                              className={cn(
                                'rounded p-0.5 transition-opacity',
                                plFav
                                  ? 'text-amber-400 opacity-100'
                                  : 'text-slate-500 opacity-0 hover:text-amber-400 group-hover:opacity-100',
                              )}
                              aria-label={plFav ? 'Unpin pipeline' : 'Pin pipeline'}
                              title={plFav ? 'Unpin pipeline' : 'Pin pipeline'}
                            >
                              <Star size={11} fill={plFav ? 'currentColor' : 'none'} />
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
                              aria-label="Delete pipeline"
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

      {recents.length > 0 && (
        <div className="border-t border-slate-800 px-2 py-2">
          <div className="px-1 pb-1 text-[10px] uppercase tracking-wider text-slate-500">
            {t('nav.recent')}
          </div>
          <ul className="space-y-0.5">
            {recents.map((r) => {
              const Icon = r.kind === 'project' ? Folder : r.kind === 'pipeline' ? GitBranch : History;
              return (
                <li key={`${r.kind}-${r.id}`}>
                  <button
                    type="button"
                    onClick={() =>
                      setView(
                        r.kind === 'project'
                          ? { type: 'project', id: r.id }
                          : r.kind === 'pipeline'
                            ? { type: 'pipeline', id: r.id }
                            : { type: 'build', id: r.id },
                      )
                    }
                    className="density-row flex w-full items-center gap-2 truncate rounded px-2 py-0.5 text-left text-[11px] text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                    title={r.label}
                  >
                    <Icon size={11} className="shrink-0 text-slate-500" />
                    <span className="truncate">{r.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </aside>
  );
}

function NavItem({
  icon,
  label,
  onClick,
  active,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  onClick(): void;
  active?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'density-row flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
        active ? 'bg-slate-800 text-slate-100' : 'text-slate-300 hover:bg-slate-800/60',
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
