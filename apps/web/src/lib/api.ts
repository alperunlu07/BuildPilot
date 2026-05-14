import type {
  Build,
  BuildArtifact,
  BuildLogEntry,
  Commit,
  NodeTemplate,
  Pipeline,
  Project,
  ProjectSummary,
  SshHost,
  StepType,
  TelegramConfigPublic,
  TelegramConfigUpdate,
} from '@buildpilot/shared-types';

const API = '/api';

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  // Only advertise a JSON content type when there's a body — Fastify's
  // built-in JSON parser refuses an empty body when the header is set,
  // which silently broke every body-less DELETE / POST in the dashboard
  // (cancel build, fetch project, pull project, delete project / pipeline).
  const headers: Record<string, string> = {};
  if (init?.body !== undefined && init.body !== null) {
    headers['Content-Type'] = 'application/json';
  }
  if (init?.headers) Object.assign(headers, init.headers);

  const res = await fetch(`${API}${path}`, { ...init, headers });
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
  clonePipeline: (id: string, name?: string) =>
    http<Pipeline>(`/pipelines/${id}/clone`, {
      method: 'POST',
      body: JSON.stringify(name ? { name } : {}),
    }),

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
  getBuildArtifacts: (id: string) => http<BuildArtifact[]>(`/builds/${id}/artifacts`),
  artifactDownloadUrl: (id: number) => `${API}/artifacts/${id}/download`,
  triggerBuild: (pipelineId: string, fromNodeId?: string) =>
    http<Build>('/builds', {
      method: 'POST',
      body: JSON.stringify({ pipelineId, ...(fromNodeId ? { fromNodeId } : {}) }),
    }),
  cancelBuild: (id: string) =>
    http<{ ok: true }>(`/builds/${id}/cancel`, { method: 'POST' }),

  // ── Node templates ───────────────────────────────────────
  listNodeTemplates: () => http<NodeTemplate[]>('/node-templates'),
  createNodeTemplate: (input: {
    name: string;
    description?: string | null;
    baseStepType: StepType;
    data: Record<string, unknown>;
  }) =>
    http<NodeTemplate>('/node-templates', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateNodeTemplate: (
    id: string,
    patch: Partial<{
      name: string;
      description: string | null;
      baseStepType: StepType;
      data: Record<string, unknown>;
    }>,
  ) =>
    http<NodeTemplate>(`/node-templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteNodeTemplate: (id: string) =>
    http<{ ok: true }>(`/node-templates/${id}`, { method: 'DELETE' }),

  // ── Saved SSH hosts ──────────────────────────────────────
  listHosts: () => http<SshHost[]>('/hosts'),
  createHost: (input: {
    name: string;
    host: string;
    identityFile?: string | null;
    password?: string | null;
    skipStrictHostKey?: boolean;
    description?: string | null;
  }) => http<SshHost>('/hosts', { method: 'POST', body: JSON.stringify(input) }),
  updateHost: (
    id: string,
    patch: Partial<{
      name: string;
      host: string;
      identityFile: string | null;
      password: string | null;
      skipStrictHostKey: boolean;
      description: string | null;
    }>,
  ) => http<SshHost>(`/hosts/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteHost: (id: string) =>
    http<{ ok: true }>(`/hosts/${id}`, { method: 'DELETE' }),
  pingHost: (id: string) =>
    http<{ ok: boolean; capabilities?: import('@buildpilot/shared-types').HostCapabilities; error?: string }>(
      `/hosts/${id}/ping`,
      { method: 'POST' },
    ),

  // ── Telegram settings ────────────────────────────────────
  getTelegramConfig: () => http<TelegramConfigPublic>('/config/telegram'),
  updateTelegramConfig: (input: TelegramConfigUpdate) =>
    http<TelegramConfigPublic>('/config/telegram', {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  testTelegram: (input: { botToken?: string; chatId?: string } = {}) =>
    http<{ ok: true } | { ok: false; error: string }>('/config/telegram/test', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};
