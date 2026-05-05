import { create } from 'zustand';
import type {
  Build,
  Commit,
  Pipeline,
  ProjectSummary,
  ServerEvent,
} from '@buildpilot/shared-types';
import { api } from '../lib/api';

export type View =
  | { type: 'projects' }
  | { type: 'project'; id: string }
  | { type: 'pipeline'; id: string };

export interface CommitToast {
  id: string;
  projectId: string;
  pipelineId: string;
  branch: string;
  commits: Commit[];
  createdAt: number;
}

interface State {
  projects: ProjectSummary[];
  pipelines: Pipeline[];
  builds: Build[];
  activeBuild: Build | null;
  liveLog: string;
  view: View;
  toasts: CommitToast[];

  loadProjects(): Promise<void>;
  loadPipelines(projectId?: string): Promise<void>;
  loadBuilds(filter?: { projectId?: string; pipelineId?: string }): Promise<void>;
  addProject(input: { path: string; name?: string }): Promise<void>;
  removeProject(id: string): Promise<void>;
  setView(view: View): void;
  upsertPipeline(p: Pipeline): void;
  removePipeline(id: string): void;
  triggerBuild(pipelineId: string): Promise<Build>;
  pullProject(id: string): Promise<void>;
  dismissToast(id: string): void;
  handleEvent(event: ServerEvent): void;
}

export const useStore = create<State>((set, get) => ({
  projects: [],
  pipelines: [],
  builds: [],
  activeBuild: null,
  liveLog: '',
  view: { type: 'projects' },
  toasts: [],

  async loadProjects() {
    set({ projects: await api.listProjects() });
  },
  async loadPipelines(projectId) {
    set({ pipelines: await api.listPipelines(projectId) });
  },
  async loadBuilds(filter = {}) {
    set({ builds: await api.listBuilds({ ...filter, limit: 30 }) });
  },
  async addProject(input) {
    await api.addProject(input);
    await get().loadProjects();
  },
  async removeProject(id) {
    await api.removeProject(id);
    set({
      projects: get().projects.filter((p) => p.id !== id),
      view: { type: 'projects' },
    });
  },
  setView(view) {
    set({ view });
  },
  upsertPipeline(p) {
    const idx = get().pipelines.findIndex((x) => x.id === p.id);
    if (idx === -1) set({ pipelines: [p, ...get().pipelines] });
    else {
      const next = [...get().pipelines];
      next[idx] = p;
      set({ pipelines: next });
    }
  },
  removePipeline(id) {
    set({ pipelines: get().pipelines.filter((p) => p.id !== id) });
  },
  async triggerBuild(pipelineId) {
    const b = await api.triggerBuild(pipelineId);
    set({ activeBuild: b, liveLog: '' });
    await get().loadBuilds();
    return b;
  },
  async pullProject(id) {
    await api.pullProject(id);
  },
  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
  handleEvent(event) {
    switch (event.type) {
      case 'newCommit': {
        const id = `${event.projectId}:${event.pipelineId}:${Date.now()}`;
        set({
          toasts: [
            ...get().toasts,
            {
              id,
              projectId: event.projectId,
              pipelineId: event.pipelineId,
              branch: event.branch,
              commits: event.commits,
              createdAt: Date.now(),
            },
          ],
        });
        // Best-effort: refresh project list so lastBuildSha-derived UI updates.
        void get().loadProjects();
        break;
      }
      case 'buildStarted':
        set({ activeBuild: event.build, liveLog: '' });
        void get().loadBuilds();
        break;
      case 'buildLog':
        if (get().activeBuild?.id === event.buildId) {
          set({ liveLog: get().liveLog + event.chunk });
        }
        break;
      case 'buildFinished':
        if (get().activeBuild?.id === event.build.id) {
          set({ activeBuild: event.build });
        }
        void get().loadBuilds();
        break;
      case 'projectAdded':
      case 'projectRemoved':
        void get().loadProjects();
        break;
      case 'pollerTick':
        // Quiet event; could surface "last checked" timestamps later.
        break;
    }
  },
}));
