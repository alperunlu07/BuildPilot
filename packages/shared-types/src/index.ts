// Project: a registered git repository on disk.
export interface Project {
  id: string;
  name: string;
  path: string; // absolute path
  defaultBranch: string;
  createdAt: number;
}

export interface ProjectSummary extends Project {
  watchedBranches: string[];
  lastBuildSha: string | null;
  lastBuildAt: number | null;
}

// Commit info — surfaced to the dashboard for collapsible commit lists.
export interface Commit {
  sha: string;
  shortSha: string;
  author: string;
  email: string;
  date: number; // unix ms
  subject: string;
  body: string;
}

// ── Pipeline ────────────────────────────────────────────────────────────────
export type StepType = 'checkout' | 'pull' | 'shell' | 'unityBatch';

export interface PipelineNode {
  id: string;
  type: StepType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface PipelineEdge {
  id: string;
  source: string;
  target: string;
  condition?: 'success' | 'failure' | 'always';
}

export type AutoTriggerMode = 'off' | 'ask' | 'pull' | 'pullAndBuild';

export interface PipelineWatch {
  branch: string;
  intervalSec: number;
  autoTrigger: AutoTriggerMode;
}

export interface Pipeline {
  id: string;
  projectId: string;
  name: string;
  watch: PipelineWatch;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  createdAt: number;
  updatedAt: number;
  lastBuiltSha: string | null;
}

// ── Build ───────────────────────────────────────────────────────────────────
export type BuildStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled';

export interface Build {
  id: string;
  pipelineId: string;
  projectId: string;
  triggerSha: string;
  triggerBranch: string;
  status: BuildStatus;
  startedAt: number;
  finishedAt: number | null;
  log: string;
}

// ── Step data shapes ────────────────────────────────────────────────────────
export interface CheckoutStepData {
  branch: string;
}

export interface PullStepData {
  remote?: string;
}

export interface ShellStepData {
  command: string;
  cwd?: string; // relative to project path; defaults to project root
}

export interface UnityBatchStepData {
  unityPath: string;
  buildTarget: string;
  executeMethod: string;
  extraArgs?: string;
  logPath?: string;
}

// ── Server-Sent Events ──────────────────────────────────────────────────────
export type ServerEvent =
  | { type: 'newCommit'; projectId: string; pipelineId: string; branch: string; commits: Commit[] }
  | { type: 'pollerTick'; projectId: string; branch: string; head: string }
  | { type: 'buildStarted'; build: Build }
  | { type: 'buildLog'; buildId: string; chunk: string }
  | { type: 'buildFinished'; build: Build }
  | { type: 'projectAdded'; project: Project }
  | { type: 'projectRemoved'; projectId: string };

// ── Server config ───────────────────────────────────────────────────────────
export interface ServerConfig {
  host: string;
  port: number;
  pollIntervalSec: number;
  dbPath: string;
  webOrigin: string | null;
}
