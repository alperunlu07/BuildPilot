import { Bell, ChevronRight, Menu, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store/store';
import { Badge } from '../ui/Badge';
import { Kbd } from '../ui/Kbd';
import { UserMenu } from '../UserMenu';

// UI v2 Faz 3 — replaces the standalone Breadcrumb component with the
// design's topbar: left-aligned breadcrumb, centred Cmd+K trigger,
// right-aligned "N builds running" pill + avatar.
//
// Breadcrumb logic mirrors the legacy Breadcrumb.tsx so view → crumb
// mapping stays consistent across the migration.

interface TopbarProps {
  // Mobile hamburger callback. Only rendered below md; the desktop
  // sidebar handles its own collapse state.
  onOpenMobileNav?(): void;
}

export function Topbar({ onOpenMobileNav }: TopbarProps): JSX.Element | null {
  const view = useStore((s) => s.view);
  const projects = useStore((s) => s.projects);
  const pipelines = useStore((s) => s.pipelines);
  const builds = useStore((s) => s.builds);
  const setView = useStore((s) => s.setView);
  const openPalette = useStore((s) => s.openPalette);
  const { t } = useTranslation();

  // Home renders its own large hero header — the topbar collapses to a
  // hamburger-only strip on mobile and disappears on desktop.
  if (view.type === 'home') {
    if (!onOpenMobileNav) return null;
    return (
      <div className="topbar-mobile-only flex items-center border-b border-border-subtle bg-bg-base px-3 h-11 md:hidden">
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="rounded-btn p-1.5 text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          aria-label="Open navigation"
        >
          <Menu size={16} />
        </button>
        <span className="ml-2 text-sm font-semibold text-text-primary">BuildPilot</span>
      </div>
    );
  }

  const runningCount = builds.filter((b) => b.status === 'running').length;

  return (
    <header
      role="banner"
      className="topbar-row flex items-center gap-3 px-3 h-11 bg-bg-base border-b border-border-subtle"
    >
      {/* Left: hamburger (mobile) + breadcrumb */}
      <div className="flex items-center gap-2 min-w-0 shrink-0">
        {onOpenMobileNav && (
          <button
            type="button"
            onClick={onOpenMobileNav}
            className="rounded-btn p-1.5 text-text-secondary hover:bg-bg-hover hover:text-text-primary md:hidden"
            aria-label="Open navigation"
          >
            <Menu size={16} />
          </button>
        )}
        <Breadcrumb
          view={view}
          projects={projects}
          pipelines={pipelines}
          builds={builds}
          setView={setView}
          tHome={t('breadcrumbs.home')}
          tProjects={t('breadcrumbs.projects')}
          tPipeline={t('breadcrumbs.pipeline')}
          tBuilds={t('breadcrumbs.builds')}
          tSettings={t('breadcrumbs.settings')}
          tDiskUsage={t('breadcrumbs.diskUsage')}
          tHosts={t('nav.hosts')}
        />
      </div>

      {/* Centre: Cmd+K trigger. Visually a search input but click-only —
          opens the command palette which has the actual input. */}
      <button
        type="button"
        onClick={openPalette}
        className="flex items-center gap-2 mx-auto h-7 px-2.5 max-w-[460px] flex-1 bg-bg-panel border border-border-subtle rounded-btn text-text-faint text-[12px] hover:border-border hover:text-text-muted transition-colors"
        title="Open command palette"
      >
        <Search size={12} />
        <span className="flex-1 text-left">Jump to anything…</span>
        <Kbd>⌘K</Kbd>
      </button>

      {/* Right: running builds pill + notifications + user menu */}
      <div className="flex items-center gap-1.5 shrink-0">
        {runningCount > 0 && (
          <Badge variant="running" className="px-2.5 h-6 text-[11.5px]">
            <span className="inline-block size-1.5 rounded-full bg-status-running animate-pulse-dot" aria-hidden />
            {runningCount} running
          </Badge>
        )}
        <button
          type="button"
          className="rounded-btn p-1.5 text-text-muted hover:bg-bg-hover hover:text-text-primary"
          aria-label="Notifications"
          title="Notifications (coming soon)"
          disabled
        >
          <Bell size={14} />
        </button>
        <UserMenu />
      </div>
    </header>
  );
}

interface BreadcrumbProps {
  view: ReturnType<typeof useStore.getState>['view'];
  projects: ReturnType<typeof useStore.getState>['projects'];
  pipelines: ReturnType<typeof useStore.getState>['pipelines'];
  builds: ReturnType<typeof useStore.getState>['builds'];
  setView: ReturnType<typeof useStore.getState>['setView'];
  tHome: string;
  tProjects: string;
  tPipeline: string;
  tBuilds: string;
  tSettings: string;
  tDiskUsage: string;
  tHosts: string;
}

function Breadcrumb({
  view,
  projects,
  pipelines,
  builds,
  setView,
  tHome,
  tProjects,
  tPipeline,
  tBuilds,
  tSettings,
  tDiskUsage,
  tHosts,
}: BreadcrumbProps): JSX.Element {
  type Crumb = { label: string; onClick?: () => void };
  const crumbs: Crumb[] = [
    { label: tHome, onClick: () => setView({ type: 'home' }) },
  ];

  switch (view.type) {
    case 'projects':
      crumbs.push({ label: tProjects });
      break;
    case 'pipeline': {
      const pl = pipelines.find((x) => x.id === view.id);
      const proj = pl ? projects.find((p) => p.id === pl.projectId) : undefined;
      if (proj) {
        // Faz 4 — project crumb resolves back to the pipeline editor of
        // the first pipeline under the same project (loops back to here
        // when only one pipeline exists, which is fine).
        crumbs.push({
          label: proj.name,
          onClick: () => {
            const first = pipelines.find((x) => x.projectId === proj.id);
            if (first) setView({ type: 'pipeline', id: first.id });
            else setView({ type: 'projects' });
          },
        });
      }
      crumbs.push({ label: pl ? pl.name : `${tPipeline} ${view.id.slice(0, 7)}` });
      break;
    }
    case 'builds':
      crumbs.push({ label: tBuilds });
      break;
    case 'build': {
      const b = builds.find((x) => x.id === view.id);
      const pl = b ? pipelines.find((x) => x.id === b.pipelineId) : undefined;
      const proj = pl ? projects.find((p) => p.id === pl.projectId) : undefined;
      crumbs.push({ label: tBuilds, onClick: () => setView({ type: 'builds' }) });
      if (proj) {
        crumbs.push({
          label: proj.name,
          onClick: () => {
            const first = pipelines.find((x) => x.projectId === proj.id);
            if (first) setView({ type: 'pipeline', id: first.id });
            else setView({ type: 'projects' });
          },
        });
      }
      if (pl) crumbs.push({ label: pl.name, onClick: () => setView({ type: 'pipeline', id: pl.id }) });
      crumbs.push({ label: `#${view.id.slice(0, 7)}` });
      break;
    }
    case 'settings':
      crumbs.push({ label: tSettings });
      break;
    case 'diskUsage':
      crumbs.push({ label: tDiskUsage });
      break;
    case 'hosts':
      crumbs.push({ label: tHosts });
      break;
    case 'catalog':
      crumbs.push({ label: 'Step Catalog' });
      break;
  }

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 min-w-0">
      {crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5 min-w-0">
            {i > 0 && <ChevronRight size={11} className="text-text-faint shrink-0" />}
            {c.onClick && !isLast ? (
              <button
                type="button"
                onClick={c.onClick}
                className="text-[12.5px] text-text-muted hover:text-text-primary truncate transition-colors"
              >
                {c.label}
              </button>
            ) : (
              <span className="text-[12.5px] text-text-primary font-medium truncate">
                {c.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
