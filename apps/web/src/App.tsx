import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { AddProjectDialog } from './components/AddProjectDialog';
import { BuildLogPanel } from './components/BuildLogPanel';
import { ToastContainer } from './components/ToastContainer';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { PipelinePage } from './pages/PipelinePage';
import { useStore } from './store/store';
import { onConnected, subscribe } from './lib/events';

export function App() {
  const view = useStore((s) => s.view);
  const loadProjects = useStore((s) => s.loadProjects);
  const loadPipelines = useStore((s) => s.loadPipelines);
  const loadBuilds = useStore((s) => s.loadBuilds);
  const handleEvent = useStore((s) => s.handleEvent);

  const [openAdd, setOpenAdd] = useState(false);

  useEffect(() => {
    void loadProjects();
    void loadPipelines();
    void loadBuilds();
  }, [loadProjects, loadPipelines, loadBuilds]);

  useEffect(() => subscribe(handleEvent), [handleEvent]);

  // Refresh data whenever the SSE stream (re)connects so the dashboard recovers
  // automatically after a server restart or a slow first start.
  useEffect(
    () =>
      onConnected(() => {
        void loadProjects();
        void loadPipelines();
        void loadBuilds();
      }),
    [loadProjects, loadPipelines, loadBuilds],
  );

  return (
    <div className="flex h-full bg-slate-950 text-slate-100">
      <Sidebar onAddProject={() => setOpenAdd(true)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {view.type === 'projects' && <ProjectsPage onAdd={() => setOpenAdd(true)} />}
          {view.type === 'project' && <ProjectDetailPage projectId={view.id} />}
          {view.type === 'pipeline' && <PipelinePage pipelineId={view.id} />}
        </div>
        <BuildLogPanel />
      </main>

      <ToastContainer />
      <AddProjectDialog open={openAdd} onClose={() => setOpenAdd(false)} />
    </div>
  );
}
