import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FileLock,
  Folder,
  GitBranch,
  Github,
  History,
  Home,
  KeyRound,
  LineChart,
  ListOrdered,
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
import { useStore } from '../../store/store';
import { useMinWidth } from '../../lib/breakpoint';
import { cn } from '../../lib/cn';
import { Logo } from '../Logo';
import { UserMenu } from '../UserMenu';
import { StatusDot, type StatusDotVariant } from '../ui/StatusDot';
import { Kbd } from '../ui/Kbd';

// UI v2 Faz 3 — full sidebar rewrite using the v2 token palette. Preserves
// every behaviour from the legacy components/Sidebar.tsx (favorites tree,
// recents, drag-to-resize, mobile drawer, collapse rail) — only the paint
// changes:
//   • bg-bg-panel / border-border-subtle (v2 surfaces) replace the bp.*
//     legacy aliases
//   • brand row gets a "Local CI/CD" tagline + Cmd+K trigger as a search
//     bar matching the design's sb-cmdk affordance
//   • count badges align right via the .sb-count style — wire real counts
//     for Builds (running) and Hosts; placeholders for "SOON" rows
//
// The store interaction surface area is identical, so existing tests
// against the store keep passing.

const WIDTH_KEY = 'buildpilot.sidebar.width';
const COLLAPSED_KEY = 'buildpilot.sidebar.collapsed';
const PROJECTS_OPEN_KEY = 'buildpilot.sidebar.projectsOpen';
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;
const COLLAPSED_WIDTH = 56;
const DEFAULT_WIDTH = 288;

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

// Open-project ids set, persisted so the user's tree expansion survives
// reloads. Treated as a JSON-encoded string[] so we can grow the data
// shape (per-pipeline open flags, etc.) without bumping the key.
function readStoredOpenProjects(): Set<string> {
  try {
    const raw = localStorage.getItem(PROJECTS_OPEN_KEY);
    if (!raw) return new Set();
    const ids = JSON.parse(raw);
    if (Array.isArray(ids)) return new Set(ids.filter((v): v is string => typeof v === 'string'));
  } catch {
    // ignore
  }
  return new Set();
}

interface Props {
  onAddProject(): void;
  onShowChangelog(): void;
  changelogHasUnread?: boolean;
  mobileOpen?: boolean;
  onMobileClose?(): void;
}

export function Sidebar({
  onAddProject,
  onShowChangelog,
  changelogHasUnread,
  mobileOpen = false,
  onMobileClose,
}: Props) {
  const projects = useStore((s) => s.projects);
  const pipelines = useStore((s) => s.pipelines);
  const builds = useStore((s) => s.builds);
  const hosts = useStore((s) => s.hosts);
  const queue = useStore((s) => s.queue);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const setProjectView = useStore((s) => s.setProjectView);
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
  const [openProjects, setOpenProjects] = useState<Set<string>>(() => readStoredOpenProjects());
  const dragStartRef = useRef<{ x: number; w: number } | null>(null);
  const isDesktop = useMinWidth('md');

  useEffect(() => {
    if (isDesktop || !mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onMobileClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDesktop, mobileOpen, onMobileClose]);

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

  useEffect(() => {
    try {
      localStorage.setItem(PROJECTS_OPEN_KEY, JSON.stringify([...openProjects]));
    } catch {
      // ignore
    }
  }, [openProjects]);

  // Responsive overhaul Faz 1 — drawer mode width capped at 320px via
  // JS plus an additional CSS-only `max-w-[85vw]` clamp on the rendered
  // aside (see the className below). The CSS clamp is what handles
  // orientation changes — reading `window.innerWidth` here at render
  // time would freeze the value at first paint, since useMinWidth('md')
  // only re-renders when crossing the md threshold.
  const effectiveWidth = !isDesktop
    ? Math.min(width, 320)
    : collapsed
      ? COLLAPSED_WIDTH
      : width;

  const favProjects = projects.filter((p) => favorites.projectIds.includes(p.id));
  const favPipelines = pipelines.filter((p) => favorites.pipelineIds.includes(p.id));

  function cycleTheme() {
    const next = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';
    setTheme(next);
  }
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;

  function toggleProject(id: string) {
    setOpenProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Live count derivations for nav badges.
  const runningCount = builds.filter((b) => b.status === 'running').length;
  // QueueSnapshot.lanes[].running and .pending hold the per-lane build lists;
  // sum across lanes for the sidebar's at-a-glance "Queue (N)" badge.
  const queuePending =
    queue?.lanes.reduce(
      (acc, lane) => acc + lane.running.length + lane.pending.length,
      0,
    ) ?? 0;

  // ── Collapsed rail (desktop only) ─────────────────────────────────────────
  if (collapsed && isDesktop) {
    return (
      <aside
        role="navigation"
        aria-label="Primary navigation (collapsed)"
        style={{ width: COLLAPSED_WIDTH }}
        className="density-card relative flex h-full shrink-0 flex-col items-center border-r border-border-subtle bg-bg-panel py-2"
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="mb-2 rounded-btn p-1.5 text-text-muted hover:bg-bg-hover hover:text-text-primary"
          title="Expand sidebar"
          aria-label="Expand sidebar"
        >
          <ChevronsRight size={16} />
        </button>
        <div className="flex flex-col items-center gap-1">
          <RailItem icon={<Home size={16} />} active={view.type === 'home' || view.type === 'diskUsage'} onClick={() => setView({ type: 'home' })} label={t('nav.home')} />
          <RailItem icon={<History size={16} />} active={view.type === 'builds' || view.type === 'build'} onClick={() => setView({ type: 'builds' })} label={t('nav.builds')} />
          <RailItem icon={<Server size={16} />} active={view.type === 'hosts'} onClick={() => setView({ type: 'hosts' })} label={t('nav.hosts')} />
          <RailItem icon={<ListOrdered size={16} />} active={view.type === 'queue'} onClick={() => setView({ type: 'queue' })} label="Queue" />
          <RailItem icon={<LineChart size={16} />} active={view.type === 'trends'} onClick={() => setView({ type: 'trends' })} label="Trends" />
          <RailItem icon={<AlertTriangle size={16} />} active={view.type === 'flakyTests'} onClick={() => setView({ type: 'flakyTests' })} label="Flaky tests" />
          <RailItem icon={<KeyRound size={16} />} active={view.type === 'secrets'} onClick={() => setView({ type: 'secrets' })} label="Secrets" />
          <RailItem icon={<FileLock size={16} />} active={view.type === 'vaultFiles'} onClick={() => setView({ type: 'vaultFiles' })} label="File vault" />
          <RailItem icon={<Github size={16} />} active={view.type === 'vcsCredentials'} onClick={() => setView({ type: 'vcsCredentials' })} label="VCS credentials" />
          <RailItem icon={<CheckCircle2 size={16} />} active={view.type === 'approvals'} onClick={() => setView({ type: 'approvals' })} label="Approvals" />
          <RailItem icon={<Settings size={16} />} active={view.type === 'settings'} onClick={() => setView({ type: 'settings' })} label={t('nav.settings')} />
          <RailItem icon={<Search size={16} />} onClick={openPalette} label="Command palette" />
          <RailItem icon={<Plus size={16} />} onClick={onAddProject} label={t('actions.addProject')} />
        </div>
      </aside>
    );
  }

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
          className="fixed inset-0 z-40 bg-bg-overlay backdrop-blur-sm md:hidden"
        />
      )}
      <aside
        role="navigation"
        aria-label="Primary navigation"
        style={{ width: effectiveWidth }}
        className={cn(
          // `max-w-[85vw]` re-clamps the inline width above so a phone
          // that rotates portrait→landscape (or any other intra-mobile
          // viewport change) immediately recomputes the drawer cap from
          // the new viewport without needing a JS re-render. md+ ignores
          // it because the inline width is always ≤ 400, well under 85vw.
          'density-card relative flex h-full max-w-[85vw] flex-col border-r border-border-subtle bg-bg-panel overflow-hidden',
          mobileClasses,
        )}
        aria-hidden={!isDesktop && !mobileOpen ? true : undefined}
      >
        {/* ── Brand row ─────────────────────────────────────────────────── */}
        <div className="px-3 pt-3 pb-1 border-b border-border-subtle">
          <div className="flex items-center gap-2.5 px-1 pb-3">
            <button
              type="button"
              onClick={() => setView({ type: 'projects' })}
              className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
              aria-label="Go to projects"
            >
              <Logo size={22} className="text-accent shrink-0" />
              <div className="leading-tight min-w-0">
                <div className="text-[14px] font-semibold tracking-tight text-text-primary truncate">
                  BuildPilot
                </div>
                <div className="text-[10px] uppercase tracking-wider text-text-faint">
                  Local CI/CD
                </div>
              </div>
            </button>
            <div className="flex items-center gap-0.5 shrink-0">
              <UserMenu />
              <IconBtn onClick={cycleTheme} title={`${t('actions.toggleTheme')} (now: ${theme})`} ariaLabel={t('actions.toggleTheme')}>
                <ThemeIcon size={13} />
              </IconBtn>
              <IconBtn onClick={onAddProject} title={t('actions.addProject')} ariaLabel={t('actions.addProject')}>
                <Plus size={13} />
              </IconBtn>
              <IconBtn
                onClick={() => setCollapsed(true)}
                title="Collapse sidebar"
                ariaLabel="Collapse sidebar"
                className="hidden md:inline-flex"
              >
                <ChevronsLeft size={13} />
              </IconBtn>
            </div>
          </div>

          {/* Cmd+K trigger row */}
          <button
            type="button"
            onClick={openPalette}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 mb-2 bg-bg-base border border-border-subtle rounded-btn text-text-faint text-[12px] hover:border-border hover:text-text-muted transition-colors"
            title="Open command palette"
          >
            <Search size={12} />
            <span>Jump to…</span>
            <Kbd className="ml-auto">⌘K</Kbd>
          </button>
        </div>

        {/* ── Primary nav ───────────────────────────────────────────────── */}
        <nav className="flex flex-col gap-px py-2 px-2 border-b border-border-subtle">
          <NavItem
            icon={<Home size={14} />}
            label={t('nav.home')}
            active={view.type === 'home' || view.type === 'diskUsage'}
            onClick={() => setView({ type: 'home' })}
          />
          <NavItem
            icon={<History size={14} />}
            label="Builds & Logs"
            active={view.type === 'builds' || view.type === 'build'}
            onClick={() => setView({ type: 'builds' })}
            count={runningCount > 0 ? runningCount : undefined}
          />
          <NavItem
            icon={<Server size={14} />}
            label={t('nav.hosts')}
            active={view.type === 'hosts'}
            onClick={() => setView({ type: 'hosts' })}
            count={hosts.length > 0 ? hosts.length : undefined}
          />
          <NavItem
            icon={<ListOrdered size={14} />}
            label="Queue"
            active={view.type === 'queue'}
            onClick={() => setView({ type: 'queue' })}
            count={queuePending > 0 ? queuePending : undefined}
            title="Pending and running builds, grouped by lane"
          />
          <NavItem
            icon={<Boxes size={14} />}
            label="Step Catalog"
            active={view.type === 'catalog'}
            onClick={() => setView({ type: 'catalog' })}
            title="Reference for every step type BuildPilot supports"
          />
          <NavItem
            icon={<LineChart size={14} />}
            label="Trends"
            active={view.type === 'trends'}
            onClick={() => setView({ type: 'trends' })}
            title="Per-pipeline P50/P95 duration + success-rate trend"
          />
          <NavItem
            icon={<AlertTriangle size={14} />}
            label="Flaky tests"
            active={view.type === 'flakyTests'}
            onClick={() => setView({ type: 'flakyTests' })}
            title="Tests that pass sometimes and fail others over recent builds"
          />
          <NavItem
            icon={<KeyRound size={14} />}
            label="Secrets"
            active={view.type === 'secrets'}
            onClick={() => setView({ type: 'secrets' })}
            title="Named secrets referenced from pipeline steps via ${{ secrets.NAME }}"
          />
          <NavItem
            icon={<FileLock size={14} />}
            label="File vault"
            active={view.type === 'vaultFiles'}
            onClick={() => setView({ type: 'vaultFiles' })}
            title="Encrypted file storage referenced via ${{ files.NAME }}"
          />
          <NavItem
            icon={<Github size={14} />}
            label="VCS credentials"
            active={view.type === 'vcsCredentials'}
            onClick={() => setView({ type: 'vcsCredentials' })}
            title="Manage tokens used to post check-runs back to GitHub / GitLab / Gitea"
          />
          <NavItem
            icon={<CheckCircle2 size={14} />}
            label="Approvals"
            active={view.type === 'approvals'}
            onClick={() => setView({ type: 'approvals' })}
            title="Builds currently waiting on a manual approval decision"
          />
          <NavItem
            icon={<Settings size={14} />}
            label={t('nav.settings')}
            active={view.type === 'settings'}
            onClick={() => setView({ type: 'settings' })}
          />
        </nav>

        {/* ── Favorites ──────────────────────────────────────────────────── */}
        {(favProjects.length > 0 || favPipelines.length > 0) && (
          <div className="px-2 pt-2 pb-1 border-b border-border-subtle">
            <SectionHead label={t('nav.favorites')} />
            <ul className="flex flex-col gap-px">
              {favProjects.map((p) => (
                <li key={`fav-p-${p.id}`}>
                  <TreeRow
                    icon={<Folder size={12} className="text-accent" />}
                    label={p.name}
                    // Faz 4 — `project` view removed; we surface the project's
                    // first pipeline instead. `active` highlights when the
                    // current pipeline belongs to this project.
                    active={
                      view.type === 'pipeline' &&
                      pipelines.find((pl) => pl.id === view.id)?.projectId === p.id
                    }
                    onClick={() => setProjectView(p.id)}
                    indent={0}
                  />
                </li>
              ))}
              {favPipelines.map((pl) => (
                <li key={`fav-pl-${pl.id}`}>
                  <TreeRow
                    icon={<GitBranch size={12} className="text-emerald-400" />}
                    label={pl.name}
                    active={view.type === 'pipeline' && view.id === pl.id}
                    onClick={() => setView({ type: 'pipeline', id: pl.id })}
                    indent={0}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Projects tree ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-2 pt-2 pb-2">
          <SectionHead
            label={t('nav.projects')}
            count={projects.length}
            action={
              <button
                type="button"
                onClick={onAddProject}
                className="rounded-btn p-0.5 text-text-muted hover:bg-bg-hover hover:text-text-primary"
                title={t('actions.addProject')}
                aria-label={t('actions.addProject')}
              >
                <Plus size={11} />
              </button>
            }
          />
          {projects.length === 0 ? (
            <div className="px-2 py-4 text-[12px] text-text-muted">
              No projects. Click <span className="text-text-secondary">+</span> to add one.
            </div>
          ) : (
            <ul className="flex flex-col gap-px">
              {projects.map((p) => {
                const projectPipelines = pipelines.filter((pl) => pl.projectId === p.id);
                // Faz 4 — `project` view removed; "active" now means the
                // currently-open pipeline belongs to this project.
                const projectActive =
                  view.type === 'pipeline' && projectPipelines.some((pl) => pl.id === view.id);
                const isFav = favorites.projectIds.includes(p.id);
                const isOpen = openProjects.has(p.id) || projectActive;
                return (
                  <li key={p.id}>
                    <div
                      className={cn(
                        'group flex items-center gap-1 px-2 h-[26px] rounded-btn text-[12.5px]',
                        projectActive
                          ? 'bg-bg-hover text-text-primary'
                          : 'text-text-primary hover:bg-bg-hover',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggleProject(p.id)}
                        className="rounded-btn p-0.5 text-text-muted hover:text-text-primary shrink-0"
                        aria-label={isOpen ? 'Collapse project' : 'Expand project'}
                      >
                        {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setProjectView(p.id)}
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                      >
                        <Folder size={12} className="text-accent shrink-0" />
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
                            : 'text-text-muted opacity-0 hover:text-amber-400 group-hover:opacity-100',
                        )}
                        aria-label={isFav ? 'Unpin project' : 'Pin project'}
                      >
                        <Star size={11} fill={isFav ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          softDeleteProject(p.id);
                        }}
                        className="rounded p-0.5 text-text-muted opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100"
                        title="Remove this project"
                        aria-label="Remove project"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                    {isOpen && projectPipelines.length > 0 && (
                      <ul className="flex flex-col gap-px mt-px">
                        {projectPipelines.map((pl) => {
                          const plActive = view.type === 'pipeline' && view.id === pl.id;
                          const plFav = favorites.pipelineIds.includes(pl.id);
                          const lastBuild = builds.find((b) => b.pipelineId === pl.id);
                          const dot = mapStatusToDot(lastBuild?.status);
                          return (
                            <li key={pl.id}>
                              <div
                                className={cn(
                                  'group flex items-center gap-1.5 pl-6 pr-2 h-6 rounded-btn text-[12px] transition-colors',
                                  plActive
                                    ? 'bg-accent-soft text-accent'
                                    : 'text-text-muted hover:bg-bg-hover hover:text-text-secondary',
                                )}
                              >
                                <button
                                  type="button"
                                  onClick={() => setView({ type: 'pipeline', id: pl.id })}
                                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                                >
                                  {dot ? <StatusDot variant={dot} size={6} /> : <GitBranch size={11} className="text-emerald-400 shrink-0" />}
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
                                      : 'text-text-muted opacity-0 hover:text-amber-400 group-hover:opacity-100',
                                  )}
                                  aria-label={plFav ? 'Unpin pipeline' : 'Pin pipeline'}
                                >
                                  <Star size={10} fill={plFav ? 'currentColor' : 'none'} />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    softDeletePipeline(pl.id);
                                  }}
                                  className="rounded p-0.5 text-text-muted opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100"
                                  title="Delete this pipeline"
                                  aria-label="Delete pipeline"
                                >
                                  <Trash2 size={10} />
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
          )}
        </div>

        {/* ── Recents ───────────────────────────────────────────────────── */}
        {recents.length > 0 && (
          <div className="border-t border-border-subtle px-2 py-2">
            <SectionHead label={t('nav.recent')} small />
            <ul className="flex flex-col gap-px">
              {recents.map((r) => {
                const Icon = r.kind === 'project' ? Folder : r.kind === 'pipeline' ? GitBranch : History;
                return (
                  <li key={`${r.kind}-${r.id}`}>
                    <button
                      type="button"
                      onClick={() => {
                        // Faz 4 — project recents resolve to their first
                        // pipeline since the `project` view type is gone.
                        if (r.kind === 'project') setProjectView(r.id);
                        else if (r.kind === 'pipeline') setView({ type: 'pipeline', id: r.id });
                        else setView({ type: 'build', id: r.id });
                      }}
                      className="flex w-full items-center gap-2 truncate rounded-btn px-2 h-5 text-left text-[11px] text-text-muted hover:bg-bg-hover hover:text-text-secondary transition-colors"
                      title={r.label}
                    >
                      <Icon size={10} className="shrink-0 text-text-muted" />
                      <span className="truncate">{r.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="border-t border-border-subtle px-3 py-2">
          <button
            type="button"
            onClick={onShowChangelog}
            className="flex w-full items-center gap-2 rounded-btn px-1 py-1 text-left text-[11px] text-text-muted hover:bg-bg-hover hover:text-text-primary transition-colors"
            aria-label={changelogHasUnread ? "What's new (unread)" : "What's new"}
          >
            <Sparkles size={11} className="shrink-0 text-accent" />
            <span className="flex-1">What's new</span>
            {changelogHasUnread && (
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
            )}
          </button>
        </div>

        {/* Drag-to-resize handle (desktop only) */}
        <div
          onMouseDown={onResizeMouseDown}
          className="group absolute right-0 top-0 z-10 hidden h-full w-1 cursor-col-resize bg-transparent hover:bg-accent/30 md:block"
          title="Drag to resize"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
        />
        {!isDesktop && (
          <button
            type="button"
            onClick={onMobileClose}
            className="absolute right-2 top-2 rounded-btn p-1 text-text-secondary hover:bg-bg-hover hover:text-text-primary md:hidden"
            aria-label="Close navigation"
          >
            <X size={16} />
          </button>
        )}
      </aside>
    </>
  );
}

// ── Building blocks ────────────────────────────────────────────────────────

function NavItem({
  icon,
  label,
  active,
  onClick,
  count,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick(): void;
  count?: number;
  title?: string;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'group relative flex w-full items-center gap-2.5 px-2.5 h-7 rounded-btn text-[12.5px] text-left transition-colors',
        active
          ? 'bg-bg-hover text-text-primary'
          : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
      )}
    >
      {active && (
        <span
          className="absolute -left-3 top-1/2 -translate-y-1/2 w-[3px] h-3.5 rounded-r bg-accent"
          aria-hidden
        />
      )}
      <span className="shrink-0 text-text-muted group-hover:text-text-secondary">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {typeof count === 'number' && count > 0 && (
        <span className="inline-flex items-center justify-center px-1.5 h-4 rounded font-mono text-[10px] bg-bg-elevated border border-border-subtle text-text-muted">
          {count}
        </span>
      )}
    </button>
  );
}

function TreeRow({
  icon,
  label,
  active,
  onClick,
  indent,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick(): void;
  indent: number;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-1.5 px-2 h-6 rounded-btn text-[12px] text-left transition-colors',
        active ? 'bg-accent-soft text-accent' : 'text-text-secondary hover:bg-bg-hover',
      )}
      style={{ paddingLeft: 8 + indent * 16 }}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

function SectionHead({
  label,
  count,
  action,
  small = false,
}: {
  label: string;
  count?: number;
  action?: React.ReactNode;
  small?: boolean;
}): JSX.Element {
  return (
    <div className={cn('flex items-center gap-2 px-2 pb-1.5', small ? 'pb-1 pt-1' : '')}>
      <span className={cn('uppercase tracking-wider font-semibold text-text-muted', small ? 'text-[9px]' : 'text-[10px]')}>
        {label}
      </span>
      {typeof count === 'number' && (
        <span className="font-mono text-[10px] text-text-faint">{count}</span>
      )}
      {action && <span className="ml-auto">{action}</span>}
    </div>
  );
}

function IconBtn({
  onClick,
  title,
  ariaLabel,
  children,
  className,
}: {
  onClick(): void;
  title: string;
  ariaLabel: string;
  children: React.ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      className={cn(
        'rounded-btn p-1.5 text-text-muted border border-transparent hover:bg-bg-hover hover:text-text-primary hover:border-border-subtle transition-colors',
        className,
      )}
    >
      {children}
    </button>
  );
}

function RailItem({
  icon,
  active,
  onClick,
  label,
}: {
  icon: React.ReactNode;
  active?: boolean;
  onClick(): void;
  label: string;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-btn transition-colors',
        active ? 'bg-bg-hover text-text-primary' : 'text-text-muted hover:bg-bg-hover hover:text-text-primary',
      )}
    >
      {icon}
    </button>
  );
}

function mapStatusToDot(status: string | undefined): StatusDotVariant | null {
  switch (status) {
    case 'success': return 'success';
    case 'failed': return 'failed';
    case 'running': return 'running';
    case 'pending': return 'pending';
    case 'cancelled': return 'cancel';
    case 'skipped': return 'skipped';
    default: return null;
  }
}
