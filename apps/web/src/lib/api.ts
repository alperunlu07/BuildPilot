import type {
  Build,
  BuildLogEntry,
  Commit,
  Pipeline,
  Project,
  ProjectSummary,
} from '@buildpilot/shared-types';

const API = '/api';

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${text ? `: ${text}` : ''}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  health: () => http<{ ok: boolean; version: string }>('/health'),

  // ── Projects ─────────────────────────────────────────────
  listProjects: () => http<ProjectSummary[]>('/projects'),
  getProject: (id: string) => http<Project>(`/projects/${id}`),
  addProject: (input: { path: string; name?: string }) =>
    http<Project>('/projects', { method: 'POST', body: JSON.stringify(input) }),
  removeProject: (id: string) =>
    http<{ ok: true }>(`/projects/${id}`, { method: 'DELETE' }),
  branches: (id: string) => http<string[]>(`/projects/${id}/branches`),
  commits: (
    id: string,
    opts: { branch?: string; limit?: number; sinceSha?: string; all?: boolean } = {},
  ) => {
    const qs = new URLSearchParams();
    if (opts.branch) qs.set('branch', opts.branch);
    if (opts.limit !== undefined) qs.set('limit', String(opts.limit));
    if (opts.sinceSha) qs.set('sinceSha', opts.sinceSha);
    if (opts.all) qs.set('all', 'true');
    const q = qs.toString();
    return http<Commit[]>(`/projects/${id}/commits${q ? `?${q}` : ''}`);
  },
  pullProject: (id: string) =>
    http<{ ok: true; branch: string; result: string }>(`/projects/${id}/pull`, { method: 'POST' }),
  fetchProject: (id: string) =>
    http<{ ok: true }>(`/projects/${id}/fetch`, { method: 'POST' }),
  currentBranch: (id: string) =>
    http<{ branch: string; sha: string | null }>(`/projects/${id}/current-branch`),

  // ── Pipelines ────────────────────────────────────────────
  listPipelines: (projectId?: string) =>
    http<Pipeline[]>(projectId ? `/pipelines?projectId=${projectId}` : '/pipelines'),
  getPipeline: (id: string) => http<Pipeline>(`/pipelines/${id}`),
  createPipeline: (input: Omit<Pipeline, 'id' | 'createdAt' | 'updatedAt' | 'lastBuiltSha'>) =>
    http<Pipeline>('/pipelines', { method: 'POST', body: JSON.stringify(input) }),
  updatePipeline: (id: string, input: Partial<Omit<Pipeline, 'id' | 'projectId' | 'createdAt' | 'updatedAt' | 'lastBuiltSha'>>) =>
    http<Pipeline>(`/pipelines/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deletePipeline: (id: string) =>
    http<{ ok: true }>(`/pipelines/${id}`, { method: 'DELETE' }),

  // ── Builds ───────────────────────────────────────────────
  listBuilds: (filter: { projectId?: string; pipelineId?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (filter.projectId) qs.set('projectId', filter.projectId);
    if (filter.pipelineId) qs.set('pipelineId', filter.pipelineId);
    if (filter.limit !== undefined) qs.set('limit', String(filter.limit));
    const q = qs.toString();
    return http<Build[]>(`/builds${q ? `?${q}` : ''}`);
  },
  getBuild: (id: string) => http<Build>(`/builds/${id}`),
  getBuildEntries: (id: string, sinceSeq?: number) => {
    const qs = sinceSeq !== undefined ? `?sinceSeq=${sinceSeq}` : '';
    return http<BuildLogEntry[]>(`/builds/${id}/entries${qs}`);
  },
  triggerBuild: (pipelineId: string, fromNodeId?: string) =>
    http<Build>('/builds', {
      method: 'POST',
      body: JSON.stringify({ pipelineId, ...(fromNodeId ? { fromNodeId } : {}) }),
    }),
  cancelBuild: (id: string) =>
    http<{ ok: true }>(`/builds/${id}/cancel`, { method: 'POST' }),
};
