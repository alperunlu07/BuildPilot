import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { AddProjectDialog } from './components/AddProjectDialog';
import { BuildLogPanel } from './components/BuildLogPanel';
import { ConfirmDialog } from './components/ConfirmDialog';
import { HostsDialog } from './components/HostsDialog';
import { ToastContainer } from './components/ToastContainer';
import { UndoToast } from './components/UndoToast';
import { ActiveBuildsWidget } from './components/ActiveBuildsWidget';
import { Breadcrumb } from './components/Breadcrumb';
import { CommandPalette } from './components/CommandPalette';
import { ChangelogDrawer, useUnreadChangelog } from './components/ChangelogDrawer';
import { KeyboardShortcutsHelp } from './components/KeyboardShortcutsHelp';
import { CreatePipelineDialog } from './components/CreatePipelineDialog';
import { HomePage } from './pages/HomePage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { PipelinePage } from './pages/PipelinePage';
import { BuildsPage } from './pages/BuildsPage';
import { BuildDetailPage } from './pages/BuildDetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { DiskUsagePage } from './pages/DiskUsagePage';
import { TestReportPage } from './pages/TestReportPage';
import { useStore } from './store/store';
import { onConnected, subscribe } from './lib/events';
import { ensurePermission } from './lib/notifications';
import { useGlobalShortcuts } from './lib/keyboard';
import { applyTheme, subscribeSystemTheme } from './lib/theme';
import { pathToView, viewToPath, viewsEqual } from './lib/router';

export function App() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const theme = useStore((s) => s.theme);
  const loadProjects = useStore((s) => s.loadProjects);
  const loadPipelines = useStore((s) => s.loadPipelines);
  const loadBuilds = useStore((s) => s.loadBuilds);
  const loadNodeTemplates = useStore((s) => s.loadNodeTemplates);
  const loadHosts = useStore((s) => s.loadHosts);
  const handleEvent = useStore((s) => s.handleEvent);
  const confirmation = useStore((s) => s.confirmation);
  const closeConfirmation = useStore((s) => s.closeConfirmation);

  const [openAdd, setOpenAdd] = useState(false);
  const [openHosts, setOpenHosts] = useState(false);
  const [openChangelog, setOpenChangelog] = useState(false);
  const [openCreatePipeline, setOpenCreatePipeline] = useState<string | null>(null);
  // Mobile drawer open state — only consumed below md. Auto-close whenever
  // the route changes so tapping a nav item dismisses the drawer.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Stable per-view key for effects (close mobile drawer on navigation).
  // We cover the legacy `id` variants plus the Cluster 11.F views which
  // carry buildId/pipelineId instead.
  const viewKey =
    view.type === 'testReport'
      ? `testReport:${view.buildId}`
      : `${view.type}:${'id' in view ? view.id : ''}`;
  useEffect(() => {
    setMobileNavOpen(false);
  }, [viewKey]);
  const { hasUnread } = useUnreadChangelog();

  // Auto-open the changelog drawer on first visit after a new release.
  useEffect(() => {
    if (hasUnread) setOpenChangelog(true);
  }, [hasUnread]);

  useEffect(() => {
    void loadProjects();
    void loadPipelines();
    void loadBuilds();
    void loadNodeTemplates();
    void loadHosts();
    void ensurePermission();
  }, [loadProjects, loadPipelines, loadBuilds, loadNodeTemplates, loadHosts]);

  useEffect(() => subscribe(handleEvent), [handleEvent]);

  // Refresh data whenever the SSE stream (re)connects so the dashboard recovers
  // automatically after a server restart or a slow first start.
  useEffect(
    () =>
      onConnected(() => {
        void loadProjects();
        void loadPipelines();
        void loadBuilds();
        void loadNodeTemplates();
        void loadHosts();
      }),
    [loadProjects, loadPipelines, loadBuilds, loadNodeTemplates, loadHosts],
  );

  // System theme listener — only reacts when the user picked `system`.
  useEffect(() => {
    if (theme !== 'system') return;
    return subscribeSystemTheme(() => applyTheme('system'));
  }, [theme]);

  // URL <-> view sync. The Zustand `view` remains the source of truth for
  // existing components; this effect just mirrors it into the address bar
  // and reacts to browser back/forward.
  useEffect(() => {
    const initial = pathToView(window.location.pathname);
    if (!viewsEqual(initial, view)) setView(initial);
    function onPop() {
      const v = pathToView(window.location.pathname);
      if (!viewsEqual(v, useStore.getState().view)) setView(v);
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const path = viewToPath(view);
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
  }, [view]);

  useGlobalShortcuts({
    onNewPipeline: () => {
      const current = useStore.getState().view;
      if (current.type === 'project') setOpenCreatePipeline(current.id);
      else if (current.type === 'pipeline') {
        const pl = useStore.getState().pipelines.find((p) => p.id === current.id);
        if (pl) setOpenCreatePipeline(pl.projectId);
      }
    },
  });

  return (
    <div className="flex h-full bg-slate-950 text-slate-100">
      <Sidebar
        onAddProject={() => setOpenAdd(true)}
        onManageHosts={() => setOpenHosts(true)}
        onShowChangelog={() => setOpenChangelog(true)}
        changelogHasUnread={hasUnread}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <Breadcrumb onOpenMobileNav={() => setMobileNavOpen(true)} />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {view.type === 'home' && <HomePage />}
          {view.type === 'projects' && <ProjectsPage onAdd={() => setOpenAdd(true)} />}
          {view.type === 'project' && <ProjectDetailPage projectId={view.id} />}
          {view.type === 'pipeline' && <PipelinePage pipelineId={view.id} />}
          {view.type === 'builds' && <BuildsPage />}
          {view.type === 'build' && <BuildDetailPage buildId={view.id} />}
          {view.type === 'settings' && <SettingsPage />}
          {view.type === 'diskUsage' && <DiskUsagePage />}
          {view.type === 'testReport' && <TestReportPage buildId={view.buildId} />}
        </div>
        <BuildLogPanel />
      </main>

      <ToastContainer />
      <UndoToast />
      <ActiveBuildsWidget />
      <CommandPalette
        onAddProject={() => setOpenAdd(true)}
        onManageHosts={() => setOpenHosts(true)}
      />
      <KeyboardShortcutsHelp />
      <AddProjectDialog open={openAdd} onClose={() => setOpenAdd(false)} />
      <HostsDialog open={openHosts} onClose={() => setOpenHosts(false)} />
      <ChangelogDrawer open={openChangelog} onClose={() => setOpenChangelog(false)} />
      {openCreatePipeline && (() => {
        const proj = useStore.getState().projects.find((p) => p.id === openCreatePipeline);
        return (
          <CreatePipelineDialog
            projectId={openCreatePipeline}
            defaultBranch={proj?.defaultBranch ?? 'main'}
            open
            onClose={() => setOpenCreatePipeline(null)}
            onCreated={(p) => {
              setOpenCreatePipeline(null);
              setView({ type: 'pipeline', id: p.id });
            }}
          />
        );
      })()}
      <ConfirmDialog
        open={confirmation !== null}
        title={confirmation?.title ?? ''}
        body={confirmation?.body ?? ''}
        confirmLabel={confirmation?.confirmLabel}
        cancelLabel={confirmation?.cancelLabel}
        variant={confirmation?.variant}
        typedConfirmation={confirmation?.typedConfirmation}
        onCancel={closeConfirmation}
        onConfirm={async () => {
          const cb = confirmation?.onConfirm;
          closeConfirmation();
          if (cb) await cb();
        }}
      />
    </div>
  );
}
