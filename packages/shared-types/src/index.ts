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
  | 'telegramNotify'
  | 'aiPrompt'
  | 'artifact'
  | 'remoteSsh'
  | 'sftpUpload'
  | 'xcodebuild'
  | 'gitMerge'
  | 's3Upload';

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
  // When true, the poller sends a Telegram message with Build / Skip
  // inline-keyboard buttons whenever this pipeline's watched branch
  // advances. Requires a bot configured in ~/.buildpilot/config.json.
  telegramApprovals?: boolean;
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

export interface TelegramNotifyStepData {
  // Leave blank to fall back to the bot configured in
  // ~/.buildpilot/config.json (telegram.botToken / telegram.defaultChatId).
  botToken?: string;
  chatId?: string;
  text: string;
  parseMode?: 'HTML' | 'MarkdownV2' | 'plain';
  // 'true' = disable notification sound
  silent?: string;
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
  // Optional path to a private key file. Mutually exclusive with `password`.
  identityFile?: string;
  // Optional password (used in lieu of identityFile). Plaintext in the
  // pipeline definition until the secrets vault lands — handle with care.
  password?: string;
  // Remote working directory; the command runs after `cd <cwd>`.
  cwd?: string;
  // Shell command to run on the remote host.
  command: string;
  // When 'true' (string for select-field compatibility), passes
  // -o StrictHostKeyChecking=no — convenient for fresh Mac agents.
  skipStrictHostKey?: string;
}

export interface SftpUploadStepData {
  host: string;
  identityFile?: string;
  password?: string;
  // Local file path (relative to project root or absolute).
  localPath: string;
  // Remote destination path (absolute).
  remotePath: string;
  skipStrictHostKey?: string;
}

export interface S3UploadStepData {
  // AWS credentials. Plaintext in the pipeline definition until the
  // secrets vault lands.
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
  // Local file path (relative or absolute).
  localPath: string;
  // S3 object key (path inside the bucket).
  key: string;
  storageClass?: 'STANDARD' | 'STANDARD_IA' | 'REDUCED_REDUNDANCY' | 'GLACIER' | 'DEEP_ARCHIVE';
  makePresignedUrl?: string;
  presignedExpiresSec?: number;
  // When set, after the main upload the step PUTs a JSON manifest at this
  // key with { channel, platform, version, url, sha256, size, archive_format,
  // released_at }. Empty string disables.
  manifestKey?: string;
  manifestChannel?: string;
  manifestPlatform?: string;
}

export interface GitMergeStepData {
  // Branch to pull commits from. Local (e.g. "development") or remote
  // (e.g. "origin/development"). The combobox lists both.
  sourceBranch: string;
  // 'true' (string for select-field compatibility) → pass --no-ff so a merge
  // commit is always created, even when fast-forward would be possible.
  noFastForward?: string;
  // Optional override of the merge commit message.
  message?: string;
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

// User-defined "save this configured node as a reusable palette entry"
// preset. At runtime a templated node behaves exactly like a regular node
// of `baseStepType`; the template only matters at design time.
export interface NodeTemplate {
  id: string;
  name: string;
  description: string | null;
  baseStepType: StepType;
  // Pre-filled field values cloned into a new node when the user drags this
  // template onto the canvas.
  data: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
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
  | { type: 'pipelineChanged'; pipelineId: string; action: 'created' | 'updated' | 'deleted' }
  | { type: 'nodeTemplateChanged'; templateId: string; action: 'created' | 'updated' | 'deleted' };

// ── Server config ───────────────────────────────────────────────────────────
export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  // Default chat used by telegramNotify steps that don't specify one of
  // their own, and the destination for new-commit approval prompts.
  defaultChatId: string;
}

export interface ServerConfig {
  host: string;
  port: number;
  pollIntervalSec: number;
  dbPath: string;
  webOrigin: string | null;
  telegram?: TelegramConfig;
}

// Optional per-pipeline flag exposed on PipelineWatch — when set + a bot
// is configured, new commits trigger an interactive Telegram message
// asking whether to build.
export interface TelegramApprovalConfig {
  enabled: boolean;
  // When unset, falls back to telegram.defaultChatId.
  chatId?: string;
}
