import { useEffect, useState } from 'react';
import { Sidebar } from './components/shell/Sidebar';
import { Topbar } from './components/shell/Topbar';
import { AddProjectDialog } from './components/AddProjectDialog';
import { BuildLogPanel } from './components/BuildLogPanel';
import { ConfirmDialog } from './components/ConfirmDialog';
import { HostsDialog } from './components/HostsDialog';
import { ToastContainer } from './components/ToastContainer';
import { UndoToast } from './components/UndoToast';
import { ActiveBuildsWidget } from './components/ActiveBuildsWidget';
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
import { QueuePage } from './pages/QueuePage';
import { CatalogPage } from './pages/CatalogPage';
import { SettingsPage } from './pages/SettingsPage';
import { DiskUsagePage } from './pages/DiskUsagePage';
import { HostsPage } from './pages/HostsPage';
import { TestReportPage } from './pages/TestReportPage';
import { FlakyTestsPage } from './pages/FlakyTestsPage';
import { BuildTrendsPage } from './pages/BuildTrendsPage';
import { LoginPage } from './pages/LoginPage';
import { UsersPage } from './pages/UsersPage';
import { AccountPage } from './pages/AccountPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { ApiTokensPage } from './pages/ApiTokensPage';
import { SecretsPage } from './pages/SecretsPage';
import { VaultFilesPage } from './pages/VaultFilesPage';
import { VcsCredentialsPage } from './pages/VcsCredentialsPage';
import { ApprovalsInboxPage } from './pages/ApprovalsInboxPage';
import { useStore } from './store/store';
import { onConnected, subscribe } from './lib/events';
import { ensurePermission, setDesktopNotificationsAllowedByUserPref } from './lib/notifications';
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
  const loadQueue = useStore((s) => s.loadQueue);
  const loadLanes = useStore((s) => s.loadLanes);
  const handleEvent = useStore((s) => s.handleEvent);
  const confirmation = useStore((s) => s.confirmation);
  const closeConfirmation = useStore((s) => s.closeConfirmation);
  const refreshAuth = useStore((s) => s.refreshAuth);
  const authEnabled = useStore((s) => s.authEnabled);
  const currentUser = useStore((s) => s.currentUser);
  const authChecked = useStore((s) => s.authChecked);

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
      : view.type === 'flakyTests'
        ? `flakyTests:${view.pipelineId ?? ''}`
        : view.type === 'trends'
          ? `trends:${view.pipelineId ?? ''}`
          : view.type === 'secrets'
            ? `secrets:${view.name ?? ''}`
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
    // Cluster 11.A — resolve auth state before loading anything that
    // requires authentication. When auth is disabled this resolves
    // immediately and the rest of the loaders proceed normally.
    void refreshAuth();
  }, [refreshAuth]);

  useEffect(() => {
    if (!authChecked) return;
    // When auth is on and the user isn't signed in yet, skip the data
    // loaders — every request would 401 and surface noise in the console.
    if (authEnabled && !currentUser) return;
    void loadProjects();
    void loadPipelines();
    void loadBuilds();
    void loadNodeTemplates();
    void loadHosts();
    void loadQueue();
    void loadLanes();
    void ensurePermission();
  }, [
    authChecked,
    authEnabled,
    currentUser,
    loadProjects,
    loadPipelines,
    loadBuilds,
    loadNodeTemplates,
    loadHosts,
    loadQueue,
    loadLanes,
  ]);

  useEffect(() => subscribe(handleEvent), [handleEvent]);

  // Cluster 11.A — keep notifications.ts in sync with the current user's
  // desktop preference without creating a circular import between the
  // store and the notifications helper.
  useEffect(() => {
    if (!authEnabled || !currentUser) {
      setDesktopNotificationsAllowedByUserPref(true);
      return;
    }
    setDesktopNotificationsAllowedByUserPref(currentUser.notificationPrefs?.desktop !== false);
  }, [authEnabled, currentUser]);

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
        void loadQueue();
        void loadLanes();
      }),
    [loadProjects, loadPipelines, loadBuilds, loadNodeTemplates, loadHosts, loadQueue, loadLanes],
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
    // UI v2 Faz 3 — design's app-grid template. Sidebar (variable width)
    // spans both rows on the left; Topbar + main + BottomLogPanel stack
    // vertically on the right. Grid rows: 44px topbar / 1fr main / auto
    // log panel (collapses when no active build).
    <div
      className="grid h-full bg-bg-base text-text-primary"
      style={{
        gridTemplateColumns: 'auto minmax(0, 1fr)',
        gridTemplateRows: '44px minmax(0, 1fr) auto',
        gridTemplateAreas: '"sidebar topbar" "sidebar main" "sidebar logpanel"',
      }}
    >
      <div style={{ gridArea: 'sidebar' }} className="contents md:block">
        <Sidebar
          onAddProject={() => setOpenAdd(true)}
          onShowChangelog={() => setOpenChangelog(true)}
          changelogHasUnread={hasUnread}
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
        />
      </div>
      <div style={{ gridArea: 'topbar' }} className="min-w-0">
        <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} />
      </div>
      <div style={{ gridArea: 'main' }} className="min-h-0 min-w-0 overflow-y-auto bg-bg-base">
        {view.type === 'home' && <HomePage />}
        {view.type === 'projects' && <ProjectsPage onAdd={() => setOpenAdd(true)} />}
        {view.type === 'project' && <ProjectDetailPage projectId={view.id} />}
        {view.type === 'pipeline' && <PipelinePage pipelineId={view.id} />}
        {view.type === 'builds' && <BuildsPage />}
        {view.type === 'build' && <BuildDetailPage buildId={view.id} />}
        {view.type === 'queue' && <QueuePage />}
        {view.type === 'catalog' && <CatalogPage />}
        {view.type === 'settings' && <SettingsPage />}
        {view.type === 'diskUsage' && <DiskUsagePage />}
        {view.type === 'hosts' && <HostsPage />}
        {view.type === 'testReport' && <TestReportPage buildId={view.buildId} />}
        {view.type === 'flakyTests' && <FlakyTestsPage />}
        {view.type === 'trends' && <BuildTrendsPage />}
        {view.type === 'login' && <LoginPage />}
        {view.type === 'users' && <UsersPage />}
        {view.type === 'account' && <AccountPage />}
        {view.type === 'audit' && <AuditLogPage />}
        {view.type === 'apiTokens' && <ApiTokensPage />}
        {view.type === 'secrets' && <SecretsPage />}
        {view.type === 'vaultFiles' && <VaultFilesPage />}
        {view.type === 'vcsCredentials' && <VcsCredentialsPage />}
        {view.type === 'approvals' && <ApprovalsInboxPage />}
      </div>
      <div style={{ gridArea: 'logpanel' }} className="min-w-0">
        <BuildLogPanel />
      </div>

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
