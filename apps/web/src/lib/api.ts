import type {
  ApiToken,
  AuditEventsResponse,
  AuditAction,
  AuditResource,
  Build,
  BuildArtifact,
  BuildLogEntry,
  BuildTrendsReport,
  Commit,
  CoverageReport,
  CreatedApiToken,
  CreateUserInput,
  DiskUsageReport,
  FlakyTestsReport,
  HomeMetrics,
  MeResponse,
  NodeTemplate,
  NotificationPrefs,
  Pipeline,
  PipelineMetrics,
  Project,
  ProjectSummary,
  PruneBuildsResponse,
  Secret,
  SecretUsage,
  SshHost,
  StepType,
  TelegramConfigPublic,
  TelegramConfigUpdate,
  TestReportKind,
  TestReportTree,
  UpdateUserInput,
  User,
  VaultFile,
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

  // Always include credentials so the session cookie (Cluster 11.A) makes
  // it back and forth in dev mode where the API + web run on different
  // ports. When auth is disabled the cookie isn't set, so this is a no-op.
  const res = await fetch(`${API}${path}`, { credentials: 'include', ...init, headers });
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
  // Cluster 11.G — tag-pattern preview. Returns each tag with the SHA it
  // points at, sorted with a numeric-aware reverse compare (so v2.10 sorts
  // after v2.9).
  projectTags: (id: string, limit = 50) =>
    http<Array<{ tag: string; sha: string }>>(`/projects/${id}/tags?limit=${limit}`),
  // Cluster 11.G — list of changed files for a single commit. Used by the
  // path-filter preview row drop-down.
  commitChangedFiles: (id: string, sha: string) =>
    http<{ sha: string; files: string[] }>(`/projects/${id}/commits/${sha}/changed-files`),
  projectSparkline: (id: string, limit = 30) =>
    http<Array<{
      id: string;
      pipelineId: string;
      status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
      startedAt: number;
      finishedAt: number | null;
    }>>(`/projects/${id}/sparkline?limit=${limit}`),

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
  // Inline text preview for the dashboard log viewer. Server caps at 32 MiB
  // and replaces invalid UTF-8 bytes with U+FFFD so any file is renderable.
  getArtifactText: (id: number, maxBytes?: number) =>
    http<{
      id: number;
      path: string;
      size: number;
      truncated: boolean;
      bytesRead: number;
      content: string;
    }>(`/artifacts/${id}/text${maxBytes ? `?maxBytes=${maxBytes}` : ''}`),
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
  // Cluster 11.H — recent builds that ran (or are running) on this host.
  // Pipeline-current-state best-effort; see server-side comment.
  listHostBuilds: (id: string, limit = 50) =>
    http<Array<{
      id: string;
      pipelineId: string;
      projectId: string;
      status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
      startedAt: number;
      finishedAt: number | null;
    }>>(`/hosts/${id}/builds?limit=${limit}`),
  // Cluster 11.H — hourly concurrent build count buckets for a host load
  // chart. Returns chronological order, oldest → newest.
  hostLoad: (id: string, hours = 24) =>
    http<Array<{ t: number; concurrent: number }>>(`/hosts/${id}/load?hours=${hours}`),

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

  // ── Test channel (Cluster 11.I) ──────────────────────────
  // Fires the step's runtime executor with the supplied data and reports
  // the result inline. Used by the "Send test" button on every notify step.
  testNotify: (input: { stepType: string; data: Record<string, unknown> }) =>
    http<
      | { ok: true; lines: Array<{ level: string; message: string }> }
      | { ok: false; error: string; lines?: Array<{ level: string; message: string }> }
    >('/test-notify', { method: 'POST', body: JSON.stringify(input) }),

  // ── Metrics (Cluster 10.D) ───────────────────────────────
  homeMetrics: () => http<HomeMetrics>('/metrics/home'),
  pipelineMetrics: (id: string) => http<PipelineMetrics>(`/metrics/pipeline/${id}`),
  diskUsage: () => http<DiskUsageReport>('/metrics/disk-usage'),
  pruneBuilds: (olderThanDays: number) =>
    http<PruneBuildsResponse>(`/builds/prune?olderThanDays=${olderThanDays}`, {
      method: 'POST',
    }),

  // ── Observability — test reports + coverage (Cluster 11.F) ───────────
  testReport: (
    buildId: string,
    opts: { kind?: TestReportKind; artifactId?: number } = {},
  ) => {
    const qs = new URLSearchParams();
    if (opts.kind) qs.set('kind', opts.kind);
    if (opts.artifactId !== undefined) qs.set('artifactId', String(opts.artifactId));
    const q = qs.toString();
    return http<TestReportTree>(`/builds/${buildId}/test-report${q ? `?${q}` : ''}`);
  },
  buildCoverage: (buildId: string) => http<CoverageReport>(`/builds/${buildId}/coverage`),

  // Flaky test detection (Cluster 11.F item 4).
  flakyTests: (pipelineId: string, buildCount = 30) =>
    http<FlakyTestsReport>(`/flaky-tests?pipelineId=${pipelineId}&buildCount=${buildCount}`),
  quarantineFlakyTest: (pipelineId: string, testKey: string, quarantined: boolean) =>
    http<{ pipelineId: string; quarantined: string[] }>(
      `/flaky-tests/${pipelineId}/quarantine`,
      {
        method: 'POST',
        body: JSON.stringify({ testKey, quarantined }),
      },
    ),

  // Build duration trend (Cluster 11.F item 5).
  buildTrends: (pipelineId: string, buildCount = 100) =>
    http<BuildTrendsReport>(`/metrics/trends?pipelineId=${pipelineId}&buildCount=${buildCount}`),

  // ── Auth (Cluster 11.A) ──────────────────────────────────
  me: () => http<MeResponse>('/auth/me'),
  login: (input: { username: string; password: string }) =>
    http<{ user: User; expiresAt: number }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  logout: () => http<{ ok: true }>('/auth/logout', { method: 'POST' }),

  // ── Users (Cluster 11.A) ─────────────────────────────────
  listUsers: () => http<User[]>('/users'),
  getCurrentUser: () => http<User>('/users/me'),
  createUser: (input: CreateUserInput) =>
    http<User>('/users', { method: 'POST', body: JSON.stringify(input) }),
  updateUser: (id: string, patch: UpdateUserInput) =>
    http<User>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  updateCurrentUser: (patch: UpdateUserInput) =>
    http<User>('/users/me', { method: 'PATCH', body: JSON.stringify(patch) }),
  updateNotificationPrefs: (prefs: NotificationPrefs) =>
    http<User>('/users/me', {
      method: 'PATCH',
      body: JSON.stringify({ notificationPrefs: prefs }),
    }),
  deleteUser: (id: string) =>
    http<{ ok: true }>(`/users/${id}`, { method: 'DELETE' }),

  // ── Audit log (Cluster 11.A) ─────────────────────────────
  listAuditEvents: (
    filter: {
      actor?: string;
      action?: AuditAction;
      resource?: AuditResource;
      since?: number;
      until?: number;
      limit?: number;
    } = {},
  ) => {
    const qs = new URLSearchParams();
    if (filter.actor) qs.set('actor', filter.actor);
    if (filter.action) qs.set('action', filter.action);
    if (filter.resource) qs.set('resource', filter.resource);
    if (filter.since !== undefined) qs.set('since', String(filter.since));
    if (filter.until !== undefined) qs.set('until', String(filter.until));
    if (filter.limit !== undefined) qs.set('limit', String(filter.limit));
    const q = qs.toString();
    return http<AuditEventsResponse>(`/audit-log${q ? `?${q}` : ''}`);
  },
  listAuditActors: () => http<string[]>('/audit-log/actors'),

  // ── API tokens (Cluster 11.A) ────────────────────────────
  listApiTokens: () => http<ApiToken[]>('/api-tokens'),
  createApiToken: (input: { name: string; userId?: string }) =>
    http<CreatedApiToken>('/api-tokens', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  deleteApiToken: (id: string) =>
    http<{ ok: true }>(`/api-tokens/${id}`, { method: 'DELETE' }),

  // ── Cluster 11.B — secrets & file vault ───────────────────
  listSecrets: () => http<Secret[]>('/secrets'),
  getSecret: (name: string) =>
    http<Secret>(`/secrets/${encodeURIComponent(name)}`),
  createSecret: (input: { name: string; value: string }) =>
    http<Secret>('/secrets', { method: 'POST', body: JSON.stringify(input) }),
  rotateSecret: (name: string, value: string) =>
    http<Secret>(`/secrets/${encodeURIComponent(name)}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    }),
  deleteSecret: (name: string) =>
    http<{ ok: true }>(`/secrets/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  secretUsages: (name: string) =>
    http<SecretUsage[]>(`/secrets/${encodeURIComponent(name)}/usages`),

  listVaultFiles: () => http<VaultFile[]>('/vault-files'),
  getVaultFile: (name: string) =>
    http<VaultFile>(`/vault-files/${encodeURIComponent(name)}`),
  uploadVaultFile: (input: {
    name: string;
    filename: string;
    mime: string;
    contentBase64: string;
  }) =>
    http<VaultFile>('/vault-files', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  deleteVaultFile: (name: string) =>
    http<{ ok: true }>(`/vault-files/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  vaultFileDownloadUrl: (name: string) =>
    `${API}/vault-files/${encodeURIComponent(name)}/download`,
};
