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
  parents: string[]; // parent SHAs (length >= 2 means merge)
  author: string;
  email: string;
  date: number; // unix ms
  subject: string;
  body: string;
}

// ── Pipeline ────────────────────────────────────────────────────────────────
export type StepType =
  | 'checkout'
  | 'pull'
  | 'shell'
  | 'unityBatch'
  | 'httpRequest'
  | 'slackNotify'
  | 'discordNotify'
  | 'aiPrompt'
  | 'artifact'
  | 'remoteSsh'
  | 'xcodebuild';

export type AiTool = 'claude' | 'codex' | 'aider' | 'gemini' | 'custom';

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

export interface HttpRequestStepData {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  // One header per line, in "Key: Value" form.
  headers?: string;
  body?: string;
  // Comma-separated list of acceptable status codes (e.g. "200,201,204").
  // Defaults to "2xx" handling: any 200–299 passes.
  expectedStatus?: string;
}

export interface SlackNotifyStepData {
  webhookUrl: string;
  text: string;
}

export interface DiscordNotifyStepData {
  webhookUrl: string;
  content: string;
}

export interface AiPromptStepData {
  tool: AiTool;
  // Used only when tool === 'custom'. The prompt is passed as a final arg.
  command?: string;
  prompt: string;
  // Optional cwd relative to the project root.
  cwd?: string;
  // Treat a non-zero exit code as success — useful for "best effort" fixes
  // where you want the pipeline to continue regardless.
  allowFailure?: boolean;
}

// Optional field present on any step's `data` to enable a retry-with-AI
// loop on failure. The engine will run the AI tool with a template prompt,
// then re-run the step. Loop up to maxRetries times before giving up.
export interface AiAutoFixConfig {
  enabled: boolean;
  tool: AiTool;
  // Available placeholders: {{step}}, {{error}}, {{nodeId}}.
  prompt: string;
  maxRetries: number;
}

export interface ArtifactStepData {
  // One path per line, relative to project root (or absolute). Each path can
  // be a file, a directory (lists files inside non-recursively), or a
  // directory with the suffix "/**" for a recursive walk.
  paths: string;
}

export interface RemoteSshStepData {
  // user@host or user@host:port
  host: string;
  // Optional path to a private key file.
  identityFile?: string;
  // Remote working directory; the command runs after `cd <cwd>`.
  cwd?: string;
  // Shell command to run on the remote host.
  command: string;
  // When 'true' (string for select-field compatibility), passes
  // -o StrictHostKeyChecking=no — convenient for fresh Mac agents.
  skipStrictHostKey?: string;
}

export interface XcodebuildStepData {
  // Either workspacePath (.xcworkspace) OR projectPath (.xcodeproj).
  workspacePath?: string;
  projectPath?: string;
  scheme: string;
  configuration?: 'Debug' | 'Release';
  // e.g. "generic/platform=iOS"
  destination?: string;
  archivePath?: string;
  buildAction?: 'build' | 'archive' | 'test' | 'clean';
  additionalArgs?: string;
}

export interface BuildArtifact {
  id: number;
  buildId: string;
  path: string;
  size: number;
  mtime: number;
  createdAt: number;
}

// ── Structured build logs ───────────────────────────────────────────────────
// Each entry is one logical line, tagged with the originating pipeline node
// and a coarse log level. The dashboard renders these as a logcat-style table.
export type BuildLogLevel =
  | 'system'   // pipeline-level marker (started, finished)
  | 'info'     // engine note about the step (the command being executed)
  | 'stdout'   // child process stdout line
  | 'stderr'   // child process stderr line
  | 'success'  // step completed successfully
  | 'failure'; // step failed

export interface BuildLogEntry {
  // Monotonic per-build seq from the DB; clients use it for ordering and
  // de-duping between an initial fetch and live SSE chunks.
  seq: number;
  ts: number;
  level: BuildLogLevel;
  nodeId: string | null;
  stepType: StepType | null;
  message: string;
}

// ── Server-Sent Events ──────────────────────────────────────────────────────
export type ServerEvent =
  | { type: 'newCommit'; projectId: string; pipelineId: string; branch: string; commits: Commit[] }
  | { type: 'pollerTick'; projectId: string; branch: string; head: string }
  | { type: 'buildStarted'; build: Build }
  | { type: 'buildLogEntry'; buildId: string; entry: BuildLogEntry }
  | { type: 'buildStepStarted'; buildId: string; pipelineId: string; nodeId: string; stepType: StepType }
  | {
      type: 'buildStepFinished';
      buildId: string;
      pipelineId: string;
      nodeId: string;
      stepType: StepType;
      status: 'success' | 'failed' | 'skipped';
    }
  | { type: 'buildFinished'; build: Build }
  | { type: 'projectAdded'; project: Project }
  | { type: 'projectRemoved'; projectId: string }
  | { type: 'pipelineChanged'; pipelineId: string; action: 'created' | 'updated' | 'deleted' };

// ── Server config ───────────────────────────────────────────────────────────
export interface ServerConfig {
  host: string;
  port: number;
  pollIntervalSec: number;
  dbPath: string;
  webOrigin: string | null;
}
