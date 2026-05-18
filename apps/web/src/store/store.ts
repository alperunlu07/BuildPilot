import { create } from 'zustand';
import type {
  Build,
  BuildLogEntry,
  Commit,
  HostCapabilities,
  NodeTemplate,
  NotificationPrefs,
  Pipeline,
  ProjectSummary,
  ServerEvent,
  SshHost,
  User,
} from '@buildpilot/shared-types';
import { api } from '../lib/api';
import { notify } from '../lib/notifications';
import {
  applyDensity,
  applyTheme,
  readStoredDensity,
  readStoredTheme,
  writeStoredDensity,
  writeStoredTheme,
  type Density,
  type ThemeChoice,
} from '../lib/theme';

// Cap retained per-build log entries in-memory so a chatty Unity build doesn't
// balloon the store. Older rows still live in SQLite and can be re-fetched.
const MAX_LIVE_ENTRIES_PER_BUILD = 5000;

export type View =
  | { type: 'home' }
  | { type: 'projects' }
  | { type: 'project'; id: string }
  | { type: 'pipeline'; id: string }
  | { type: 'builds' }
  | { type: 'build'; id: string }
  | { type: 'settings' }
  | { type: 'diskUsage' }
  | { type: 'hosts' }
  | { type: 'testReport'; buildId: string }
  | { type: 'trends'; pipelineId?: string }
  | { type: 'flakyTests'; pipelineId?: string }
  | { type: 'login' }
  | { type: 'users' }
  | { type: 'account' }
  | { type: 'audit' }
  | { type: 'apiTokens' }
  | { type: 'secrets'; name?: string }
  | { type: 'vaultFiles' }
  | { type: 'vcsCredentials' };

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

const LANGUAGE_KEY = 'buildpilot.lang';
const FAVORITES_KEY = 'buildpilot.favorites';
const RECENTS_KEY = 'buildpilot.recents';

export interface FavoritesState {
  projectIds: string[];
  pipelineIds: string[];
}

export type RecentItem =
  | { kind: 'project'; id: string; label: string; at: number }
  | { kind: 'pipeline'; id: string; label: string; at: number }
  | { kind: 'build'; id: string; label: string; at: number };

function readLanguage(): string {
  try {
    const raw = localStorage.getItem(LANGUAGE_KEY);
    if (raw === 'en' || raw === 'tr') return raw;
  } catch {
    // ignore
  }
  return 'en';
}

function readFavorites(): FavoritesState {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return { projectIds: [], pipelineIds: [] };
    const parsed = JSON.parse(raw) as Partial<FavoritesState>;
    return {
      projectIds: Array.isArray(parsed.projectIds) ? parsed.projectIds : [],
      pipelineIds: Array.isArray(parsed.pipelineIds) ? parsed.pipelineIds : [],
    };
  } catch {
    return { projectIds: [], pipelineIds: [] };
  }
}

function writeFavorites(f: FavoritesState): void {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(f));
  } catch {
    // ignore
  }
}

function readRecents(): RecentItem[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentItem[];
    return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
  } catch {
    return [];
  }
}

function writeRecents(r: RecentItem[]): void {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(r.slice(0, 5)));
  } catch {
    // ignore
  }
}

export interface ConfirmationRequest {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  // When set, the dialog requires the user to type this value before the
  // confirm button enables. Used for irreversible actions.
  typedConfirmation?: string;
  onConfirm(): void | Promise<void>;
}

// A pending soft-delete that fires the real API call once the undo grace
// period expires. The server has no trash-bin concept, so this exists
// purely as a client-side deferral — the UI hides the entity immediately
// and either commits or restores after the timer.
export interface PendingDeletion {
  id: string;
  kind: 'project' | 'pipeline';
  label: string;
  // Original entity, kept verbatim so an UNDO can splice it back into the
  // visible list at the right index.
  snapshot: ProjectSummary | Pipeline;
  // Position in the original list. Used to put the row back where it was.
  index: number;
  // setTimeout handle so undo can cancel before the API call fires.
  timeoutHandle: ReturnType<typeof setTimeout>;
  // When the toast will auto-expire (commit the delete). Used to drive a
  // countdown bar in the UI.
  expiresAt: number;
}

interface State {
  projects: ProjectSummary[];
  pipelines: Pipeline[];
  builds: Build[];
  nodeTemplates: NodeTemplate[];
  hosts: SshHost[];
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
  // Cluster 10.A — appearance + i18n preferences. Persisted in localStorage.
  theme: ThemeChoice;
  density: Density;
  language: string;
  favorites: FavoritesState;
  recents: RecentItem[];
  paletteOpen: boolean;
  shortcutsHelpOpen: boolean;
  pendingDeletions: PendingDeletion[];
  // Transient error banners surfaced when optimistic actions roll back.
  errorToasts: { id: string; message: string }[];
  // Cluster 11.A — auth state. `authEnabled === false` keeps the dashboard
  // wide open like today; `currentUser === null` while authEnabled is true
  // is the "please log in" state.
  authEnabled: boolean;
  currentUser: User | null;
  // True once the initial /api/auth/me call has resolved. Used to defer
  // first-paint of routed pages until we know whether to redirect to
  // /login.
  authChecked: boolean;

  loadProjects(): Promise<void>;
  loadPipelines(projectId?: string): Promise<void>;
  loadBuilds(filter?: { projectId?: string; pipelineId?: string }): Promise<void>;
  loadNodeTemplates(): Promise<void>;
  saveNodeTemplate(input: {
    name: string;
    description?: string | null;
    baseStepType: import('@buildpilot/shared-types').StepType;
    data: Record<string, unknown>;
  }): Promise<NodeTemplate>;
  deleteNodeTemplate(id: string): Promise<void>;
  loadHosts(): Promise<void>;
  saveHost(input: {
    name: string;
    host: string;
    identityFile?: string | null;
    password?: string | null;
    skipStrictHostKey?: boolean;
    description?: string | null;
  }): Promise<SshHost>;
  updateHost(
    id: string,
    patch: Partial<{
      name: string;
      host: string;
      identityFile: string | null;
      password: string | null;
      skipStrictHostKey: boolean;
      description: string | null;
    }>,
  ): Promise<SshHost | null>;
  deleteHost(id: string): Promise<void>;
  pingHost(id: string): Promise<{ ok: boolean; capabilities?: HostCapabilities; error?: string }>;
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
  setTheme(theme: ThemeChoice): void;
  setDensity(d: Density): void;
  setLanguage(lang: string): void;
  toggleFavoriteProject(id: string): void;
  toggleFavoritePipeline(id: string): void;
  pushRecent(item: Omit<RecentItem, 'at'>): void;
  openPalette(): void;
  closePalette(): void;
  togglePalette(): void;
  openShortcutsHelp(): void;
  closeShortcutsHelp(): void;
  // Cluster 10.E — schedule a soft delete that the user can undo within the
  // grace window. After the timer fires, the real API call is dispatched.
  softDeleteProject(id: string): void;
  softDeletePipeline(id: string): void;
  undoDeletion(deletionId: string): void;
  pushError(message: string): void;
  dismissError(id: string): void;
  handleEvent(event: ServerEvent): void;
  // Cluster 11.A — auth.
  refreshAuth(): Promise<void>;
  login(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
  updateNotificationPrefs(prefs: NotificationPrefs): Promise<void>;
}

const UNDO_GRACE_MS = 5000;

export const useStore = create<State>((set, get) => ({
  projects: [],
  pipelines: [],
  builds: [],
  nodeTemplates: [],
  hosts: [],
  activeBuild: null,
  view: { type: 'home' },
  toasts: [],
  stepStatus: {},
  stepTimings: {},
  entriesByBuild: {},
  confirmation: null,
  theme: readStoredTheme(),
  density: readStoredDensity(),
  language: readLanguage(),
  favorites: readFavorites(),
  recents: readRecents(),
  paletteOpen: false,
  shortcutsHelpOpen: false,
  pendingDeletions: [],
  errorToasts: [],
  authEnabled: false,
  currentUser: null,
  authChecked: false,

  async loadProjects() {
    const list = await api.listProjects();
    // Pending soft-deletes shouldn't reappear if a `projectAdded` event
    // races us into a re-fetch before the API delete fires.
    const hiddenProjects = new Set(
      get()
        .pendingDeletions.filter((d) => d.kind === 'project')
        .map((d) => (d.snapshot as ProjectSummary).id),
    );
    set({ projects: list.filter((p) => !hiddenProjects.has(p.id)) });
  },
  async loadPipelines(projectId) {
    const list = await api.listPipelines(projectId);
    const hiddenPipelines = new Set(
      get()
        .pendingDeletions.filter((d) => d.kind === 'pipeline')
        .map((d) => (d.snapshot as Pipeline).id),
    );
    set({ pipelines: list.filter((p) => !hiddenPipelines.has(p.id)) });
  },
  async loadBuilds(filter = {}) {
    set({ builds: await api.listBuilds({ ...filter, limit: 30 }) });
  },
  async loadNodeTemplates() {
    set({ nodeTemplates: await api.listNodeTemplates() });
  },
  async saveNodeTemplate(input) {
    const created = await api.createNodeTemplate(input);
    set({ nodeTemplates: [...get().nodeTemplates, created].sort((a, b) => a.name.localeCompare(b.name)) });
    return created;
  },
  async deleteNodeTemplate(id) {
    await api.deleteNodeTemplate(id);
    set({ nodeTemplates: get().nodeTemplates.filter((t) => t.id !== id) });
  },
  async loadHosts() {
    set({ hosts: await api.listHosts() });
  },
  async saveHost(input) {
    const created = await api.createHost(input);
    set({ hosts: [...get().hosts, created].sort((a, b) => a.name.localeCompare(b.name)) });
    return created;
  },
  async updateHost(id, patch) {
    const updated = await api.updateHost(id, patch);
    set({
      hosts: get()
        .hosts.map((h) => (h.id === id ? updated : h))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
    return updated;
  },
  async deleteHost(id) {
    await api.deleteHost(id);
    set({ hosts: get().hosts.filter((h) => h.id !== id) });
  },
  async pingHost(id) {
    const res = await api.pingHost(id);
    // The hostChanged SSE event from the server reloads the list so the new
    // capabilities show up everywhere; no need to mutate locally too.
    return res;
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
    // Mirror navigation into the recents list. We resolve a human-readable
    // label lazily here so callers don't need to pass one through.
    const state = get();
    let recent: Omit<RecentItem, 'at'> | null = null;
    if (view.type === 'project') {
      const p = state.projects.find((x) => x.id === view.id);
      if (p) recent = { kind: 'project', id: p.id, label: p.name };
    } else if (view.type === 'pipeline') {
      const pl = state.pipelines.find((x) => x.id === view.id);
      if (pl) recent = { kind: 'pipeline', id: pl.id, label: pl.name };
    } else if (view.type === 'build') {
      const b = state.builds.find((x) => x.id === view.id);
      if (b) {
        const pl = state.pipelines.find((x) => x.id === b.pipelineId);
        recent = {
          kind: 'build',
          id: b.id,
          label: `${pl?.name ?? 'pipeline'} · #${b.id.slice(0, 7)}`,
        };
      }
    }
    if (recent) get().pushRecent(recent);
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
    const pipeline = get().pipelines.find((p) => p.id === pipelineId);
    // Optimistic placeholder so the editor + project page can flip to
    // "Queued…" without waiting for the server round-trip. The real build
    // (with the server-assigned id) replaces this entry on success; on
    // error we roll it back and surface a toast.
    const placeholder: Build = {
      id: `opt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      pipelineId,
      projectId: pipeline?.projectId ?? '',
      triggerSha: '',
      triggerBranch: pipeline?.watch.branch ?? '',
      status: 'pending',
      startedAt: Date.now(),
      finishedAt: null,
      log: '',
      parentBuildId: null,
      matrixValues: null,
      matrixLabel: null,
    };
    set({
      activeBuild: placeholder,
      builds: [placeholder, ...get().builds],
    });
    try {
      const b = await api.triggerBuild(pipelineId, fromNodeId);
      set({
        activeBuild: b,
        builds: [b, ...get().builds.filter((x) => x.id !== placeholder.id)],
        entriesByBuild: { ...get().entriesByBuild, [b.id]: [] },
      });
      await get().loadBuilds();
      return b;
    } catch (err) {
      set({
        activeBuild: null,
        builds: get().builds.filter((x) => x.id !== placeholder.id),
      });
      get().pushError(
        `Run failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  },
  async cancelBuild(id) {
    // Optimistic flip — mark cancelled locally; rollback on error.
    const snapshot = get().builds.find((b) => b.id === id);
    if (snapshot) {
      set({
        builds: get().builds.map((b) =>
          b.id === id ? { ...b, status: 'cancelled' as const, finishedAt: b.finishedAt ?? Date.now() } : b,
        ),
        activeBuild:
          get().activeBuild?.id === id
            ? { ...get().activeBuild!, status: 'cancelled', finishedAt: get().activeBuild!.finishedAt ?? Date.now() }
            : get().activeBuild,
      });
    }
    try {
      await api.cancelBuild(id);
      await get().loadBuilds();
    } catch (err) {
      if (snapshot) {
        set({
          builds: get().builds.map((b) => (b.id === id ? snapshot : b)),
        });
      }
      get().pushError(
        `Cancel failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
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
  setTheme(theme) {
    writeStoredTheme(theme);
    applyTheme(theme);
    set({ theme });
  },
  setDensity(d) {
    writeStoredDensity(d);
    applyDensity(d);
    set({ density: d });
  },
  setLanguage(lang) {
    try {
      localStorage.setItem(LANGUAGE_KEY, lang);
    } catch {
      // ignore
    }
    set({ language: lang });
  },
  toggleFavoriteProject(id) {
    const cur = get().favorites;
    const has = cur.projectIds.includes(id);
    const next: FavoritesState = {
      ...cur,
      projectIds: has ? cur.projectIds.filter((x) => x !== id) : [...cur.projectIds, id],
    };
    writeFavorites(next);
    set({ favorites: next });
  },
  toggleFavoritePipeline(id) {
    const cur = get().favorites;
    const has = cur.pipelineIds.includes(id);
    const next: FavoritesState = {
      ...cur,
      pipelineIds: has ? cur.pipelineIds.filter((x) => x !== id) : [...cur.pipelineIds, id],
    };
    writeFavorites(next);
    set({ favorites: next });
  },
  pushRecent(item) {
    const filtered = get().recents.filter(
      (r) => !(r.kind === item.kind && r.id === item.id),
    );
    const next: RecentItem[] = [{ ...item, at: Date.now() }, ...filtered].slice(0, 5);
    writeRecents(next);
    set({ recents: next });
  },
  openPalette() {
    set({ paletteOpen: true });
  },
  closePalette() {
    set({ paletteOpen: false });
  },
  togglePalette() {
    set({ paletteOpen: !get().paletteOpen });
  },
  openShortcutsHelp() {
    set({ shortcutsHelpOpen: true });
  },
  closeShortcutsHelp() {
    set({ shortcutsHelpOpen: false });
  },
  softDeleteProject(id) {
    const state = get();
    const projects = state.projects;
    const idx = projects.findIndex((p) => p.id === id);
    if (idx === -1) return;
    const snapshot = projects[idx]!;
    const deletionId = `del-project-${id}-${Date.now().toString(36)}`;
    const expiresAt = Date.now() + UNDO_GRACE_MS;
    const handle = setTimeout(() => {
      // Time's up — commit the delete to the server. Local state is already
      // mutated; clean up the pending entry. The SSE projectRemoved event
      // will reconcile any other tabs.
      void api.removeProject(id).catch(() => {
        // If the server call fails, snap the entity back so users don't
        // silently lose data.
        const cur = get();
        const stillGone = !cur.projects.some((p) => p.id === id);
        if (stillGone) {
          set({ projects: [...cur.projects, snapshot] });
        }
      });
      set({
        pendingDeletions: get().pendingDeletions.filter((d) => d.id !== deletionId),
      });
    }, UNDO_GRACE_MS);
    const pending: PendingDeletion = {
      id: deletionId,
      kind: 'project',
      label: snapshot.name,
      snapshot,
      index: idx,
      timeoutHandle: handle,
      expiresAt,
    };
    set({
      projects: projects.filter((p) => p.id !== id),
      pendingDeletions: [...state.pendingDeletions, pending],
      view: state.view.type === 'project' && state.view.id === id
        ? { type: 'projects' }
        : state.view,
    });
  },
  softDeletePipeline(id) {
    const state = get();
    const pipelines = state.pipelines;
    const idx = pipelines.findIndex((p) => p.id === id);
    if (idx === -1) return;
    const snapshot = pipelines[idx]!;
    const deletionId = `del-pipeline-${id}-${Date.now().toString(36)}`;
    const expiresAt = Date.now() + UNDO_GRACE_MS;
    const handle = setTimeout(() => {
      void api.deletePipeline(id).catch(() => {
        const cur = get();
        const stillGone = !cur.pipelines.some((p) => p.id === id);
        if (stillGone) {
          set({ pipelines: [...cur.pipelines, snapshot] });
        }
      });
      set({
        pendingDeletions: get().pendingDeletions.filter((d) => d.id !== deletionId),
      });
    }, UNDO_GRACE_MS);
    const pending: PendingDeletion = {
      id: deletionId,
      kind: 'pipeline',
      label: snapshot.name,
      snapshot,
      index: idx,
      timeoutHandle: handle,
      expiresAt,
    };
    const nextView =
      state.view.type === 'pipeline' && state.view.id === id
        ? ({ type: 'project', id: snapshot.projectId } as View)
        : state.view;
    set({
      pipelines: pipelines.filter((p) => p.id !== id),
      pendingDeletions: [...state.pendingDeletions, pending],
      view: nextView,
    });
  },
  pushError(message) {
    const id = `err-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    set({ errorToasts: [...get().errorToasts, { id, message }] });
    // Auto-dismiss after 6 seconds so the corner doesn't fill up if many
    // calls fail in succession.
    setTimeout(() => {
      set({ errorToasts: get().errorToasts.filter((e) => e.id !== id) });
    }, 6000);
  },
  dismissError(id) {
    set({ errorToasts: get().errorToasts.filter((e) => e.id !== id) });
  },
  async refreshAuth() {
    try {
      const res = await api.me();
      set({
        authEnabled: res.authEnabled,
        currentUser: res.user,
        authChecked: true,
      });
      // If the server says auth is on and there's no user, but we're not
      // currently on the login screen, route there. We don't auto-flip
      // away from /login when the user is null — that page handles its
      // own redirect after a successful login.
      const v = get().view;
      if (
        res.authEnabled &&
        !res.user &&
        v.type !== 'login' &&
        v.type !== 'settings'
      ) {
        set({ view: { type: 'login' } });
      }
    } catch {
      // Likely a 401 surfaced as a fetch error; surface the login screen.
      set({ authChecked: true, currentUser: null });
    }
  },
  async login(username, password) {
    const res = await api.login({ username, password });
    set({ currentUser: res.user, authEnabled: true, authChecked: true });
  },
  async logout() {
    try {
      await api.logout();
    } catch {
      // ignore — we still clear locally.
    }
    set({ currentUser: null, view: { type: 'login' } });
  },
  async updateNotificationPrefs(prefs) {
    if (!get().currentUser) return;
    const updated = await api.updateNotificationPrefs(prefs);
    set({ currentUser: updated });
  },
  undoDeletion(deletionId) {
    const state = get();
    const pending = state.pendingDeletions.find((d) => d.id === deletionId);
    if (!pending) return;
    clearTimeout(pending.timeoutHandle);
    if (pending.kind === 'project') {
      const next = [...state.projects];
      const snap = pending.snapshot as ProjectSummary;
      next.splice(Math.min(pending.index, next.length), 0, snap);
      set({ projects: next });
    } else {
      const next = [...state.pipelines];
      const snap = pending.snapshot as Pipeline;
      next.splice(Math.min(pending.index, next.length), 0, snap);
      set({ pipelines: next });
    }
    set({
      pendingDeletions: state.pendingDeletions.filter((d) => d.id !== deletionId),
    });
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
      case 'notifyMatrix': {
        // Cluster 11.C — rolled-up summary for matrix pipelines. Refresh
        // the build list so the parent + every child's status flip at
        // once, then fire a single desktop toast summarising the matrix.
        // This is the dashboard counterpart to the "single message per
        // matrix" promise — individual children stayed quiet, and the
        // parent posts one notification at the end.
        void get().loadBuilds();
        const projectName =
          get().projects.find((p) => p.id === event.projectId)?.name ?? 'project';
        const pipelineName =
          get().pipelines.find((p) => p.id === event.pipelineId)?.name ?? 'pipeline';
        const bits: string[] = [];
        if (event.success > 0) bits.push(`${event.success} ok`);
        if (event.failed > 0) bits.push(`${event.failed} failed`);
        if (event.cancelled > 0) bits.push(`${event.cancelled} cancelled`);
        notify({
          title: `${projectName} · ${pipelineName} matrix done`,
          body: `${event.success}/${event.total} succeeded${
            bits.length > 0 ? ` (${bits.join(', ')})` : ''
          }`,
          tag: `notifyMatrix:${event.parentBuildId}`,
          onClick: () => get().setView({ type: 'build', id: event.parentBuildId }),
        });
        break;
      }
      case 'projectAdded':
      case 'projectRemoved':
        void get().loadProjects();
        break;
      case 'pipelineChanged':
        // Reload pipelines so API-created/edited/deleted entities show up
        // in the dashboard without manual refresh.
        void get().loadPipelines();
        break;
      case 'nodeTemplateChanged':
        void get().loadNodeTemplates();
        break;
      case 'hostChanged':
        void get().loadHosts();
        break;
      case 'pollerTick':
        // Quiet event; could surface "last checked" timestamps later.
        break;
    }
  },
}));
