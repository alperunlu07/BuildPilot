import {
  AlertTriangle,
  ChevronsLeft,
  ChevronsRight,
  Folder,
  GitBranch,
  History,
  Home,
  Monitor,
  Moon,
  Plus,
  Search,
  Server,
  Settings,
  Sparkles,
  Star,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/store';
import { cn } from '../lib/cn';
import { useMinWidth } from '../lib/breakpoint';

const WIDTH_KEY = 'buildpilot.sidebar.width';
const COLLAPSED_KEY = 'buildpilot.sidebar.collapsed';
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;
const COLLAPSED_WIDTH = 56;
const DEFAULT_WIDTH = 288; // 18rem

function readStoredWidth(): number {
  try {
    const raw = localStorage.getItem(WIDTH_KEY);
    if (!raw) return DEFAULT_WIDTH;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return DEFAULT_WIDTH;
    return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, n));
  } catch {
    return DEFAULT_WIDTH;
  }
}

function readStoredCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

interface Props {
  onAddProject(): void;
  onManageHosts(): void;
  onShowChangelog(): void;
  changelogHasUnread?: boolean;
  // Mobile-drawer controls. Above md the drawer flags are ignored and the
  // sidebar renders inline using the existing resize/collapse behavior.
  mobileOpen?: boolean;
  onMobileClose?(): void;
}

export function Sidebar({
  onAddProject,
  onManageHosts,
  onShowChangelog,
  changelogHasUnread,
  mobileOpen = false,
  onMobileClose,
}: Props) {
  const projects = useStore((s) => s.projects);
  const pipelines = useStore((s) => s.pipelines);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const softDeleteProject = useStore((s) => s.softDeleteProject);
  const softDeletePipeline = useStore((s) => s.softDeletePipeline);
  const favorites = useStore((s) => s.favorites);
  const toggleFavoriteProject = useStore((s) => s.toggleFavoriteProject);
  const toggleFavoritePipeline = useStore((s) => s.toggleFavoritePipeline);
  const recents = useStore((s) => s.recents);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const openPalette = useStore((s) => s.openPalette);
  const { t } = useTranslation();

  const [width, setWidth] = useState<number>(() => readStoredWidth());
  const [collapsed, setCollapsed] = useState<boolean>(() => readStoredCollapsed());
  const dragStartRef = useRef<{ x: number; w: number } | null>(null);
  // Below md (768px) we switch to a slide-out drawer driven by `mobileOpen`.
  // Above md we keep the existing in-flow resize/collapse behavior unchanged.
  const isDesktop = useMinWidth('md');

  // Close the drawer on Escape so keyboard users aren't trapped.
  useEffect(() => {
    if (isDesktop || !mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onMobileClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDesktop, mobileOpen, onMobileClose]);

  // Drag-to-resize handle. We move width on every mousemove so the layout
  // tracks the cursor, then persist on mouseup. Clamped to MIN/MAX so the
  // sidebar can't disappear or eat the whole viewport.
  const onResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (collapsed) return;
      e.preventDefault();
      dragStartRef.current = { x: e.clientX, w: width };
      const onMove = (ev: MouseEvent) => {
        if (!dragStartRef.current) return;
        const next = Math.max(
          MIN_WIDTH,
          Math.min(MAX_WIDTH, dragStartRef.current.w + (ev.clientX - dragStartRef.current.x)),
        );
        setWidth(next);
      };
      const onUp = () => {
        dragStartRef.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [collapsed, width],
  );

  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_KEY, String(width));
    } catch {
      // ignore
    }
  }, [width]);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      // ignore
    }
  }, [collapsed]);

  // On mobile, ignore the saved collapsed state — the drawer is either fully
  // visible (with a real width) or fully off-screen via the parent's
  // mobileOpen flag. This keeps tap targets readable on small viewports.
  const effectiveWidth = !isDesktop ? Math.min(width, 320) : collapsed ? COLLAPSED_WIDTH : width;

  const favProjects = projects.filter((p) => favorites.projectIds.includes(p.id));
  const favPipelines = pipelines.filter((p) => favorites.pipelineIds.includes(p.id));

  function cycleTheme() {
    const next = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';
    setTheme(next);
  }
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;

  // Below md, mobile drawer always renders the full sidebar (collapsed-rail
  // mode doesn't make sense on a 320px-wide drawer). Skip the collapsed
  // branch on small screens.
  if (collapsed && isDesktop) {
    return (
      <aside
        style={{ width: COLLAPSED_WIDTH }}
        className="density-card relative flex h-full shrink-0 flex-col items-center border-r border-slate-800 bg-slate-950 py-2"
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="focusable mb-2 rounded-md p-1.5 text-slate-400 hover:bg-slate-800/60 hover:text-slate-100"
          title="Expand sidebar"
          aria-label="Expand sidebar"
        >
          <ChevronsRight size={16} />
        </button>
        <div className="flex flex-col items-center gap-1">
          <IconRail
            icon={<Home size={16} className="text-sky-400" />}
            active={view.type === 'home' || view.type === 'diskUsage'}
            onClick={() => setView({ type: 'home' })}
            label={t('nav.home')}
          />
          <IconRail
            icon={<History size={16} className="text-amber-400" />}
            active={view.type === 'builds' || view.type === 'build'}
            onClick={() => setView({ type: 'builds' })}
            label={t('nav.builds')}
          />
          <IconRail
            icon={<Server size={16} className="text-slate-300" />}
            onClick={onManageHosts}
            label={t('nav.hosts')}
          />
          <IconRail
            icon={<AlertTriangle size={16} className="text-amber-400" />}
            active={view.type === 'flakyTests'}
            onClick={() => setView({ type: 'flakyTests' })}
            label="Flaky tests"
          />
          <IconRail
            icon={<Settings size={16} className="text-slate-300" />}
            active={view.type === 'settings'}
            onClick={() => setView({ type: 'settings' })}
            label={t('nav.settings')}
          />
          <IconRail
            icon={<Search size={16} className="text-slate-300" />}
            onClick={openPalette}
            label="Command palette"
          />
          <IconRail
            icon={<Plus size={16} className="text-slate-300" />}
            onClick={onAddProject}
            label={t('actions.addProject')}
          />
        </div>
      </aside>
    );
  }

  // On mobile, the sidebar becomes a fixed overlay drawer with a backdrop.
  // We always render it (so transitions can run) but hide it off-screen via
  // translate when closed. Desktop rendering is unchanged: a normal flex
  // child with `shrink-0`.
  const mobileClasses = !isDesktop
    ? cn(
        'fixed inset-y-0 left-0 z-50 transition-transform duration-200',
        mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full',
      )
    : 'shrink-0';

  return (
    <>
      {!isDesktop && mobileOpen && (
        <div
          role="presentation"
          aria-hidden="true"
          onClick={onMobileClose}
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm md:hidden"
        />
      )}
    <aside
      style={{ width: effectiveWidth }}
      className={cn(
        'density-card relative flex h-full flex-col border-r border-slate-800 bg-slate-950',
        mobileClasses,
      )}
      aria-hidden={!isDesktop && !mobileOpen ? true : undefined}
    >
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <button
          type="button"
          onClick={() => setView({ type: 'projects' })}
          className="focusable text-left"
          aria-label="Go to projects"
        >
          <div className="text-base font-semibold tracking-tight text-slate-100">BuildPilot</div>
          <div className="text-[11px] uppercase tracking-wider text-slate-400">Local CI/CD</div>
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={openPalette}
            className="focusable rounded-md border border-slate-700 p-1.5 text-slate-300 hover:border-sky-500 hover:text-sky-400"
            title="Command palette (Cmd/Ctrl+K)"
            aria-label="Command palette"
          >
            <Search size={14} />
          </button>
          <button
            type="button"
            onClick={cycleTheme}
            className="focusable rounded-md border border-slate-700 p-1.5 text-slate-300 hover:border-sky-500 hover:text-sky-400"
            title={`${t('actions.toggleTheme')} (now: ${theme})`}
            aria-label={t('actions.toggleTheme')}
          >
            <ThemeIcon size={14} />
          </button>
          <button
            type="button"
            onClick={onAddProject}
            className="focusable rounded-md border border-slate-700 p-1.5 text-slate-300 hover:border-sky-500 hover:text-sky-400"
            title={t('actions.addProject')}
            aria-label={t('actions.addProject')}
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="focusable touch-target hidden rounded-md border border-slate-700 p-1.5 text-slate-300 hover:border-sky-500 hover:text-sky-400 md:inline-flex"
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
          >
            <ChevronsLeft size={14} />
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
          active={view.type === 'flakyTests'}
          icon={<AlertTriangle size={14} className="text-amber-400" />}
          label="Flaky tests"
          onClick={() => setView({ type: 'flakyTests' })}
          title="Tests that pass sometimes and fail others over recent builds"
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
          <div className="px-3 pt-3 text-[11px] uppercase tracking-wider text-slate-400">
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
                      'focusable density-row flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs',
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
                      'focusable density-row flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs',
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

      <div className="px-3 pt-3 text-[11px] uppercase tracking-wider text-slate-400">
        {t('nav.projects')}
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {projects.length === 0 && (
          <div className="px-3 py-6 text-sm text-slate-400">
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
                    className="focusable flex min-w-0 flex-1 items-center gap-2 rounded-md text-left"
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
                      'focusable rounded p-0.5 transition-opacity',
                      isFav
                        ? 'text-amber-400 opacity-100'
                        : 'text-slate-400 opacity-0 hover:text-amber-400 group-hover:opacity-100',
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
                      softDeleteProject(p.id);
                    }}
                    // Force-visible on touch so the trash button is actually
                    // reachable without a hover state to trigger group-hover.
                    className="focusable touch-target rounded p-0.5 text-slate-400 opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100"
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
                              className="focusable flex min-w-0 flex-1 items-center gap-2 rounded-md text-left"
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
                                'focusable rounded p-0.5 transition-opacity',
                                plFav
                                  ? 'text-amber-400 opacity-100'
                                  : 'text-slate-400 opacity-0 hover:text-amber-400 group-hover:opacity-100',
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
                                softDeletePipeline(pl.id);
                              }}
                              className="focusable touch-target rounded p-0.5 text-slate-400 opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100"
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
          <div className="px-1 pb-1 text-[10px] uppercase tracking-wider text-slate-400">
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
                    className="focusable density-row flex w-full items-center gap-2 truncate rounded px-2 py-0.5 text-left text-[11px] text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                    title={r.label}
                  >
                    <Icon size={11} className="shrink-0 text-slate-400" />
                    <span className="truncate">{r.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="border-t border-slate-800 px-2 py-2">
        <button
          type="button"
          onClick={onShowChangelog}
          className="focusable flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px] text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
          aria-label={changelogHasUnread ? "What's new (unread)" : "What's new"}
        >
          <Sparkles size={11} className="shrink-0 text-sky-400" />
          <span className="flex-1">What's new</span>
          {changelogHasUnread && (
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-sky-400" />
          )}
        </button>
      </div>

      {/* Drag-to-resize handle pinned to the right edge — Tailwind cursor-col-resize hits the gap.
          role=separator + aria-label so screen-readers can announce it; aria-orientation=vertical
          since dragging changes width. Not a tab stop (no tabIndex) because keyboard users
          drive sidebar width via the collapse button. */}
      <div
        onMouseDown={onResizeMouseDown}
        className="group absolute right-0 top-0 z-10 hidden h-full w-1 cursor-col-resize bg-transparent hover:bg-sky-500/30 md:block"
        title="Drag to resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
      />
      {!isDesktop && (
        <button
          type="button"
          onClick={onMobileClose}
          className="focusable touch-target absolute right-2 top-2 rounded-md p-1 text-slate-300 hover:bg-slate-800 hover:text-slate-100 md:hidden"
          aria-label="Close navigation"
          title="Close navigation"
        >
          <X size={16} />
        </button>
      )}
    </aside>
    </>
  );
}

function IconRail({
  icon,
  active,
  onClick,
  label,
}: {
  icon: React.ReactNode;
  active?: boolean;
  onClick(): void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'focusable flex h-9 w-9 items-center justify-center rounded-md',
        active ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100',
      )}
    >
      {icon}
    </button>
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
        'focusable density-row flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
        active ? 'bg-slate-800 text-slate-100' : 'text-slate-300 hover:bg-slate-800/60',
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
