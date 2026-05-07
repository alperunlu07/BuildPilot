import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { AddProjectDialog } from './components/AddProjectDialog';
import { BuildLogPanel } from './components/BuildLogPanel';
import { ConfirmDialog } from './components/ConfirmDialog';
import { HostsDialog } from './components/HostsDialog';
import { ToastContainer } from './components/ToastContainer';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { PipelinePage } from './pages/PipelinePage';
import { BuildsPage } from './pages/BuildsPage';
import { BuildDetailPage } from './pages/BuildDetailPage';
import { useStore } from './store/store';
import { onConnected, subscribe } from './lib/events';
import { ensurePermission } from './lib/notifications';

export function App() {
  const view = useStore((s) => s.view);
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

  return (
    <div className="flex h-full bg-slate-950 text-slate-100">
      <Sidebar
        onAddProject={() => setOpenAdd(true)}
        onManageHosts={() => setOpenHosts(true)}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {view.type === 'projects' && <ProjectsPage onAdd={() => setOpenAdd(true)} />}
          {view.type === 'project' && <ProjectDetailPage projectId={view.id} />}
          {view.type === 'pipeline' && <PipelinePage pipelineId={view.id} />}
          {view.type === 'builds' && <BuildsPage />}
          {view.type === 'build' && <BuildDetailPage buildId={view.id} />}
        </div>
        <BuildLogPanel />
      </main>

      <ToastContainer />
      <AddProjectDialog open={openAdd} onClose={() => setOpenAdd(false)} />
      <HostsDialog open={openHosts} onClose={() => setOpenHosts(false)} />
      <ConfirmDialog
        open={confirmation !== null}
        title={confirmation?.title ?? ''}
        body={confirmation?.body ?? ''}
        confirmLabel={confirmation?.confirmLabel}
        cancelLabel={confirmation?.cancelLabel}
        variant={confirmation?.variant}
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
