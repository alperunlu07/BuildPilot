import { create } from 'zustand';
import type {
  Build,
  BuildLogEntry,
  Commit,
  Pipeline,
  ProjectSummary,
  ServerEvent,
} from '@buildpilot/shared-types';
import { api } from '../lib/api';
import { notify } from '../lib/notifications';

// Cap retained per-build log entries in-memory so a chatty Unity build doesn't
// balloon the store. Older rows still live in SQLite and can be re-fetched.
const MAX_LIVE_ENTRIES_PER_BUILD = 5000;

export type View =
  | { type: 'projects' }
  | { type: 'project'; id: string }
  | { type: 'pipeline'; id: string }
  | { type: 'builds' }
  | { type: 'build'; id: string };

export interface CommitToast {
  id: string;
  projectId: string;
  pipelineId: string;
  branch: string;
  commits: Commit[];
  createdAt: number;
}

export type StepRuntimeStatus = 'running' | 'success' | 'failed' | 'skipped';

export interface StepTiming {
  startedAt: number;
  finishedAt?: number;
}

export interface ConfirmationRequest {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  onConfirm(): void | Promise<void>;
}

interface State {
  projects: ProjectSummary[];
  pipelines: Pipeline[];
  builds: Build[];
  activeBuild: Build | null;
  view: View;
  toasts: CommitToast[];
  // Per-pipeline transient run state used by the editor to glow nodes.
  stepStatus: Record<string, Record<string, StepRuntimeStatus>>;
  // Per-pipeline per-node start/end timestamps from the latest run, used to
  // surface "1.2s" / "5m 12s" labels on each node.
  stepTimings: Record<string, Record<string, StepTiming>>;
  // Live log entries keyed by build id — populated by SSE buildLogEntry.
  // Pages can also seed this from the initial fetch.
  entriesByBuild: Record<string, BuildLogEntry[]>;
  // Currently-open confirmation dialog. Replaces window.confirm so popup
  // blockers / enterprise policies can't silently swallow destructive
  // actions.
  confirmation: ConfirmationRequest | null;

  loadProjects(): Promise<void>;
  loadPipelines(projectId?: string): Promise<void>;
  loadBuilds(filter?: { projectId?: string; pipelineId?: string }): Promise<void>;
  addProject(input: { path: string; name?: string }): Promise<void>;
  removeProject(id: string): Promise<void>;
  setView(view: View): void;
  upsertPipeline(p: Pipeline): void;
  removePipeline(id: string): void;
  deletePipeline(id: string): Promise<void>;
  triggerBuild(pipelineId: string, fromNodeId?: string): Promise<Build>;
  cancelBuild(id: string): Promise<void>;
  pullProject(id: string): Promise<void>;
  dismissToast(id: string): void;
  seedBuildEntries(buildId: string, entries: BuildLogEntry[]): void;
  requestConfirmation(req: ConfirmationRequest): void;
  closeConfirmation(): void;
  handleEvent(event: ServerEvent): void;
}

export const useStore = create<State>((set, get) => ({
  projects: [],
  pipelines: [],
  builds: [],
  activeBuild: null,
  view: { type: 'projects' },
  toasts: [],
  stepStatus: {},
  stepTimings: {},
  entriesByBuild: {},
  confirmation: null,

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
  async deletePipeline(id) {
    const target = get().pipelines.find((p) => p.id === id);
    await api.deletePipeline(id);
    // Remove from local list immediately for snappy UX; the SSE
    // pipelineChanged event will reconcile too.
    set({ pipelines: get().pipelines.filter((p) => p.id !== id) });
    // If the editor was open on this pipeline, hop back to its project.
    const view = get().view;
    if (view.type === 'pipeline' && view.id === id) {
      set({ view: target ? { type: 'project', id: target.projectId } : { type: 'projects' } });
    }
  },
  async triggerBuild(pipelineId, fromNodeId) {
    const b = await api.triggerBuild(pipelineId, fromNodeId);
    set({
      activeBuild: b,
      entriesByBuild: { ...get().entriesByBuild, [b.id]: [] },
    });
    await get().loadBuilds();
    return b;
  },
  async cancelBuild(id) {
    await api.cancelBuild(id);
    await get().loadBuilds();
  },
  async pullProject(id) {
    await api.pullProject(id);
  },
  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
  requestConfirmation(req) {
    set({ confirmation: req });
  },
  closeConfirmation() {
    set({ confirmation: null });
  },
  seedBuildEntries(buildId, entries) {
    // Merge with anything already arrived via SSE; dedupe by seq, keep order.
    const existing = get().entriesByBuild[buildId] ?? [];
    const seen = new Set<number>();
    const merged: BuildLogEntry[] = [];
    for (const e of [...entries, ...existing]) {
      if (seen.has(e.seq)) continue;
      seen.add(e.seq);
      merged.push(e);
    }
    merged.sort((a, b) => a.seq - b.seq);
    const trimmed =
      merged.length > MAX_LIVE_ENTRIES_PER_BUILD
        ? merged.slice(merged.length - MAX_LIVE_ENTRIES_PER_BUILD)
        : merged;
    set({ entriesByBuild: { ...get().entriesByBuild, [buildId]: trimmed } });
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

        const projectName =
          get().projects.find((p) => p.id === event.projectId)?.name ?? 'project';
        const head = event.commits[0];
        const more = event.commits.length > 1 ? ` (+${event.commits.length - 1} more)` : '';
        notify({
          title: `${projectName} · ${event.commits.length} new commit${event.commits.length === 1 ? '' : 's'} on ${event.branch}`,
          body: head ? `${head.shortSha} ${head.subject}${more}` : `branch ${event.branch} advanced`,
          tag: `newCommit:${event.projectId}:${event.branch}`,
          onClick: () => get().setView({ type: 'project', id: event.projectId }),
        });
        break;
      }
      case 'buildStarted': {
        // Reset any glow + timing state for this pipeline at the start of a
        // new run.
        const status = { ...get().stepStatus };
        status[event.build.pipelineId] = {};
        const timings = { ...get().stepTimings };
        timings[event.build.pipelineId] = {};
        set({
          activeBuild: event.build,
          stepStatus: status,
          stepTimings: timings,
          entriesByBuild: { ...get().entriesByBuild, [event.build.id]: [] },
        });
        void get().loadBuilds();
        break;
      }
      case 'buildLogEntry': {
        const all = get().entriesByBuild;
        const cur = all[event.buildId] ?? [];
        // Skip if we already have this seq (may happen between seed + live).
        if (cur.length > 0 && cur[cur.length - 1]!.seq >= event.entry.seq) {
          if (cur.some((e) => e.seq === event.entry.seq)) break;
        }
        const appended = [...cur, event.entry];
        const trimmed =
          appended.length > MAX_LIVE_ENTRIES_PER_BUILD
            ? appended.slice(appended.length - MAX_LIVE_ENTRIES_PER_BUILD)
            : appended;
        set({ entriesByBuild: { ...all, [event.buildId]: trimmed } });
        break;
      }
      case 'buildStepStarted': {
        const allStatus = { ...get().stepStatus };
        const curStatus = { ...(allStatus[event.pipelineId] ?? {}) };
        curStatus[event.nodeId] = 'running';
        allStatus[event.pipelineId] = curStatus;

        const allTimings = { ...get().stepTimings };
        const curTimings = { ...(allTimings[event.pipelineId] ?? {}) };
        curTimings[event.nodeId] = { startedAt: Date.now() };
        allTimings[event.pipelineId] = curTimings;

        set({ stepStatus: allStatus, stepTimings: allTimings });
        break;
      }
      case 'buildStepFinished': {
        const allStatus = { ...get().stepStatus };
        const curStatus = { ...(allStatus[event.pipelineId] ?? {}) };
        curStatus[event.nodeId] = event.status;
        allStatus[event.pipelineId] = curStatus;

        const allTimings = { ...get().stepTimings };
        const curTimings = { ...(allTimings[event.pipelineId] ?? {}) };
        const existing = curTimings[event.nodeId] ?? { startedAt: Date.now() };
        curTimings[event.nodeId] = { ...existing, finishedAt: Date.now() };
        allTimings[event.pipelineId] = curTimings;

        set({ stepStatus: allStatus, stepTimings: allTimings });
        break;
      }
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
      case 'pipelineChanged':
        // Reload pipelines so API-created/edited/deleted entities show up
        // in the dashboard without manual refresh.
        void get().loadPipelines();
        break;
      case 'pollerTick':
        // Quiet event; could surface "last checked" timestamps later.
        break;
    }
  },
}));
