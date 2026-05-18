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
  | 's3Upload'
  | 'testflightUpload'
  | 'keychainUnlock'
  | 'provisioningProfileInstall'
  | 'notarize'
  | 'stapleNotarization'
  | 'fastlaneMatch'
  | 'cocoapodsInstall'
  | 'swiftPackageResolve'
  | 'dsymUpload'
  | 'xcresultParse'
  | 'xcodeSelect'
  | 'ensureGitStatusClean'
  | 'incrementBuildNumber'
  | 'getBuildNumber'
  | 'changelogFromGitCommits'
  | 'updateInfoPlist'
  | 'swiftlint'
  | 'swiftFormat'
  | 'xcodebuildAnalyze'
  | 'peripheryScan'
  | 'slatherCoverage'
  | 'xcovGate'
  | 'resign'
  | 'snapshot'
  | 'frameit'
  | 'gradleBuild'
  | 'adbConnect'
  | 'adbInstall'
  | 'adbShellLaunch'
  | 'adbLogcat'
  | 'adbPair'
  | 'bundletool'
  | 'androidSign'
  | 'playConsoleUpload'
  | 'teamsNotify'
  | 'emailNotify'
  | 'appStoreConnectApi'
  | 'testflightSetWhatToTest'
  | 'testflightPublicLink'
  | 'testflightManage'
  | 'appStorePrecheck'
  | 'appStoreCreate'
  | 'appStoreUpload'
  | 'buildAppGym'
  | 'pushCertificate'
  | 'certManage'
  | 'registerDevices'
  | 'sigh'
  | 'simctlPrepare'
  | 'simctlInstallLaunch'
  | 'simctlScreenshot'
  | 'simctlPushNotification'
  | 'simctlStatusBarOverride'
  | 'simctlPrivacyGrant'
  | 'securityKeychainImport'
  | 'codesignArbitrary'
  | 'dsymVerify'
  | 'privacyManifestValidate'
  | 'privacyManifestAggregate'
  | 'appThinningReportParse'
  | 'linkMapAnalyze'
  | 'bitcodeStrip'
  | 'otaManifestGenerate'
  | 'firebaseAppDistribution'
  | 'distributionGroups'
  | 'phasedRollout'
  | 'branchTargetedTestFlight'
  | 'storekitConfigure'
  | 'steamcmdSetup'
  | 'steamUpload'
  | 'steamSetLive'
  | 'steamWorkshopUpload'
  | 'iosDeviceLog';

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
  // Phase 4 Cluster A — extra trigger surfaces. None are required; an empty
  // watch keeps the existing branch-polling behaviour.
  //
  // tagPattern: glob-style pattern matched against pushed tags (e.g.
  //   "v*.*.*"). When a matching tag advances, fire a build against the
  //   tagged commit instead of HEAD.
  tagPattern?: string;
  // cronExpr: standard 5-field cron expression evaluated in UTC. Fires a
  // build on schedule against the watched branch — independent of any
  // commit activity. Blank disables.
  cronExpr?: string;
  // pathFilter: newline-separated glob list. When non-empty, the poller
  // skips the build unless at least one changed file in the new commits
  // matches one of these globs (GitLab `rules:changes` / GH `paths`).
  pathFilter?: string;
  // cancelInProgressOnNewCommit: when true and a new commit fires while a
  // previous build for the same pipeline is still running, the previous
  // build is cancelled before the new one starts (rolling-build mode).
  cancelInProgressOnNewCommit?: boolean;
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

// Phase 4 Cluster B — per-step retry with backoff. Plain retry; no AI.
// When both this and aiAutoFix are set, the engine prefers aiAutoFix
// because that path already includes a fix loop. Stored on the step data
// as `retryPolicy`.
export interface RetryPolicy {
  enabled: boolean;
  // Number of retries (i.e. total attempts = maxRetries + 1).
  maxRetries: number;
  // Initial backoff in ms. Doubled each retry up to backoffMaxMs.
  backoffMs: number;
  backoffMaxMs: number;
}

// Phase 4 Cluster B — per-step watchdog. If a step emits no log entries
// for `idleSec` seconds the engine cancels the running children and the
// step is marked failed with a clear "watchdog" error. Stored as
// `watchdog` on the step data.
export interface WatchdogPolicy {
  enabled: boolean;
  // Seconds of log silence before the step is killed. Defaults to 600
  // (10 min) when blank — same threshold most other CIs use.
  idleSec: number;
}

export interface ArtifactStepData {
  // One path per line, relative to project root (or absolute). Each path can
  // be a file, a directory (lists files inside non-recursively), or a
  // directory with the suffix "/**" for a recursive walk.
  paths: string;
}

export interface RemoteSshStepData {
  // When set, refers to an entry in ~/.buildpilot/hosts.json — the runner
  // uses that host's saved credentials and the inline host/identity/password
  // fields below are ignored. Empty string = use the inline fields.
  hostId?: string;
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
  hostId?: string;
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

// All three Mac-only steps below share the same "where to run" pattern: pick
// a saved host (runs via ssh2) OR leave blank (runs locally with
// child_process). The local path is what you want when BuildPilot itself is
// running on the Mac; the remote path keeps a Windows host in the loop.
export interface RunsOnMaybeRemote {
  hostId?: string;
  host?: string;
  identityFile?: string;
  password?: string;
  skipStrictHostKey?: string;
}

export interface XcodebuildStepData extends RunsOnMaybeRemote {
  // Either workspacePath (.xcworkspace) OR projectPath (.xcodeproj).
  // Both may be omitted for buildAction=exportArchive (which only needs
  // archivePath + exportPath + exportOptionsPlist).
  workspacePath?: string;
  projectPath?: string;
  // Required for build/archive/test/clean; ignored by exportArchive.
  scheme?: string;
  configuration?: 'Debug' | 'Release';
  // e.g. "generic/platform=iOS"
  destination?: string;
  // Where the .xcarchive lands (archive action) or is read from (exportArchive).
  archivePath?: string;
  // exportArchive only — output directory the .ipa is written into.
  exportPath?: string;
  // exportArchive only — path to ExportOptions.plist.
  exportOptionsPlist?: string;
  buildAction?: 'build' | 'archive' | 'test' | 'clean' | 'exportArchive';
  // Phase 5 — when buildAction=test|build|archive, pipe stdout through
  // xcpretty (or xcbeautify) for human-friendly output. Adds no flags to
  // the xcodebuild argv; the runner inserts a shell pipe instead.
  prettifier?: 'none' | 'xcpretty' | 'xcbeautify';
  // Phase 2.6.D — test retry modes. Only applied when buildAction='test'.
  // 'retry-on-failure'  → -test-iterations N -retry-tests-on-failure
  // 'until-failure'     → -test-iterations N -run-tests-until-failure
  // 'repeat'            → -test-iterations N
  testRetryMode?: 'none' | 'retry-on-failure' | 'until-failure' | 'repeat';
  // -test-iterations value (Xcode 13+). Capped at 50 client-side because
  // xcodebuild itself silently caps higher values.
  testIterations?: number;
  additionalArgs?: string;
}

export interface TestflightUploadStepData extends RunsOnMaybeRemote {
  // Path to the .ipa to upload (relative to project root or absolute).
  ipaPath: string;
  // 'apiKey' uses an App Store Connect API key (apiKeyId + apiIssuerId,
  // .p8 placed in ~/.appstoreconnect/private_keys). 'appleId' uses a
  // username + app-specific password.
  authMethod?: 'apiKey' | 'appleId';
  apiKeyId?: string;
  apiIssuerId?: string;
  appleId?: string;
  appPassword?: string;
  // 'ios' (default) or 'macos' / 'tvos'.
  platform?: 'ios' | 'macos' | 'tvos';
  additionalArgs?: string;
}

export interface KeychainUnlockStepData extends RunsOnMaybeRemote {
  // Path to the keychain (e.g. ~/Library/Keychains/login.keychain-db).
  // Defaults to login.keychain-db on the running user.
  keychain?: string;
  password: string;
  // Set lock timeout in seconds. Empty leaves the existing setting untouched.
  unlockTimeoutSec?: number;
}

export interface ProvisioningProfileInstallStepData extends RunsOnMaybeRemote {
  // Path to the .mobileprovision (relative to project root or absolute).
  // For local installs this is read from the BuildPilot host; for remote
  // it's read locally then copied via SFTP to the Mac before installing.
  profilePath: string;
}

export interface NotarizeStepData extends RunsOnMaybeRemote {
  // The bundle to notarize: .app, .dmg, .pkg, or .zip.
  bundlePath: string;
  authMethod?: 'apiKey' | 'appleId';
  // apiKey auth — `--key <p8>` + `--key-id <kid>` + `--issuer <iid>`.
  apiKeyPath?: string;
  apiKeyId?: string;
  apiIssuerId?: string;
  // appleId auth — `--apple-id <id>` + `--password <p>` + `--team-id <t>`.
  appleId?: string;
  appPassword?: string;
  teamId?: string;
  // 'true' (default) blocks the step until Apple's verdict comes back.
  // 'false' returns as soon as the upload is accepted — pair with a
  // separate stapleNotarization step that runs later.
  wait?: string;
  additionalArgs?: string;
}

export interface StapleNotarizationStepData extends RunsOnMaybeRemote {
  // Bundle that already passed notarization. Stapling embeds the ticket
  // so Gatekeeper can verify the bundle offline.
  bundlePath: string;
}

export interface CocoapodsInstallStepData extends RunsOnMaybeRemote {
  // 'install' (default) or 'update'.
  command?: 'install' | 'update';
  // 'true' adds --repo-update — useful when you want to make sure the
  // specs repo is current. Costs network on every build.
  repoUpdate?: string;
  // 'true' prefixes `bundle exec ` so we use the project-pinned cocoapods
  // gem rather than the system one. Requires Gemfile.lock with cocoapods.
  useBundleExec?: string;
  // Working dir for the pod invocation. Defaults to the project root.
  cwd?: string;
  additionalArgs?: string;
}

export interface SwiftPackageResolveStepData extends RunsOnMaybeRemote {
  // Either workspacePath or projectPath. Both bundle into the same
  // -workspace / -project flag on xcodebuild.
  workspacePath?: string;
  projectPath?: string;
  scheme?: string;
  // Override the SPM cache directory. Empty = xcodebuild default
  // (~/Library/Developer/Xcode/DerivedData/<…>/SourcePackages).
  clonedSourcePackagesDirPath?: string;
  additionalArgs?: string;
}

export interface DsymUploadStepData extends RunsOnMaybeRemote {
  // Which crash-reporting service we're uploading symbols to. Each one
  // shells out to a different CLI; the runner picks the right argv shape.
  backend: 'crashlytics' | 'sentry' | 'bugsnag' | 'datadog' | 'instabug' | 'embrace' | 'newrelic';
  // Path to the .xcarchive, .dSYM, or directory of dSYMs (interpretation
  // depends on the backend — most accept all three).
  dsymPath: string;
  // ── Crashlytics fields ───────────────────────────────────────────────
  // GoogleService-Info.plist used to identify the Firebase project.
  googleServicePlistPath?: string;
  // Path to the Crashlytics upload-symbols binary. Fallback: relies on
  // PATH lookup, which usually works after `pod install`.
  uploadSymbolsBinary?: string;
  // 'ios' (default), 'macos', 'tvos', 'watchos'.
  platform?: 'ios' | 'macos' | 'tvos' | 'watchos';
  // ── Sentry fields ────────────────────────────────────────────────────
  sentryOrg?: string;
  sentryProject?: string;
  // Plaintext until the secrets vault lands. Passed via SENTRY_AUTH_TOKEN
  // env so it doesn't show on argv.
  sentryAuthToken?: string;
  // ── Bugsnag fields ───────────────────────────────────────────────────
  bugsnagApiKey?: string;
  // Custom CLI path; defaults to `bugsnag-cli` on PATH.
  bugsnagCliPath?: string;
  // ── Datadog fields (`@datadog/datadog-ci dsyms upload`) ─────────────
  // Per-region site, e.g. "datadoghq.com" / "datadoghq.eu" / "us3.datadoghq.com".
  datadogSite?: string;
  // Passed via DATADOG_API_KEY env so it doesn't show on argv.
  datadogApiKey?: string;
  // Custom CLI path; defaults to `datadog-ci` on PATH.
  datadogCliPath?: string;
  // ── Instabug fields (`Instabug_dsym_upload.sh`) ─────────────────────
  instabugAppToken?: string;
  // Custom script path; defaults to looking up `Instabug_dsym_upload.sh` on PATH.
  instabugScriptPath?: string;
  // ── Embrace fields (`embrace_symbol_upload.darwin`) ─────────────────
  embraceAppId?: string;
  embraceApiToken?: string;
  // Custom binary path; defaults to `embrace_symbol_upload.darwin`.
  embraceUploadPath?: string;
  // ── New Relic fields (`newrelic-ios-symbol-upload`) ─────────────────
  newrelicAppToken?: string;
  // Custom binary path; defaults to `newrelic-ios-symbol-upload`.
  newrelicCliPath?: string;
  // Shared additionalArgs slot for whichever backend is in play.
  additionalArgs?: string;
}

export interface XcresultParseStepData extends RunsOnMaybeRemote {
  // Path to the .xcresult bundle xcodebuild test wrote out. Set
  // -resultBundlePath on the upstream xcodebuild step to control where
  // it lands.
  bundlePath: string;
  // 'true' (default) — fail the step if any test failed. Useful for
  // surfacing test failures as red pipeline edges even when xcodebuild
  // itself was run with `|| true` to keep the build going.
  failOnTestFailure?: string;
}

export interface XcodeSelectStepData extends RunsOnMaybeRemote {
  // Absolute path to the .app bundle, e.g. /Applications/Xcode_15.4.app.
  // Passed straight to `xcode-select -s`.
  xcodePath: string;
}

export interface EnsureGitStatusCleanStepData extends RunsOnMaybeRemote {
  // Pre-flight gate: run `git status --porcelain` and fail if any output.
  // Optional cwd lets you target a worktree other than the project root.
  cwd?: string;
}

export interface IncrementBuildNumberStepData extends RunsOnMaybeRemote {
  // 'agvtool' (default) shells out to `xcrun agvtool …`. 'plistBuddy' edits
  // CFBundleVersion in a specific Info.plist directly.
  mode?: 'agvtool' | 'plistBuddy';
  // For agvtool: when set, uses `agvtool new-version -all <v>`; when blank,
  // uses `agvtool next-version -all` (auto-increment by 1).
  // For plistBuddy: required — the new value to write into CFBundleVersion.
  versionString?: string;
  // Required when mode='plistBuddy'. Path to the Info.plist whose
  // CFBundleVersion will be set.
  plistPath?: string;
  // Working dir for the command. Required for agvtool — must contain the
  // .xcodeproj. Optional / typically unused for plistBuddy.
  cwd?: string;
}

export interface GetBuildNumberStepData extends RunsOnMaybeRemote {
  // 'agvtool' (default) runs `xcrun agvtool what-version -terse`.
  // 'plistBuddy' runs `/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" …`.
  mode?: 'agvtool' | 'plistBuddy';
  // Required when mode='plistBuddy'. Path to the Info.plist to read.
  plistPath?: string;
  // Working dir. Required for agvtool — must contain the .xcodeproj.
  cwd?: string;
}

// Default cap on commits returned. Without it a fromRef..HEAD range
// spanning years buffers multi-MB strings into memory.
export const CHANGELOG_DEFAULT_MAX_COMMITS = 1000;

export interface ChangelogFromGitCommitsStepData extends RunsOnMaybeRemote {
  // Start of the commit range — exclusive (the commit at this ref is NOT
  // included). A tag like "v1.4.0" or a SHA both work.
  fromRef: string;
  // End of the commit range — inclusive. Defaults to HEAD.
  toRef?: string;
  // Maps to a `git log --pretty=format:` template:
  //   subject       → '%s'           (one subject per line)
  //   subject-body  → '%s%n%n%b%n---' (separated by --- markers)
  //   oneline       → '%h %s'        (short SHA + subject)
  format?: 'subject' | 'subject-body' | 'oneline';
  // Cap commits returned. Defaults to CHANGELOG_DEFAULT_MAX_COMMITS (1000).
  maxCommits?: number;
  // Working dir for `git log`. Defaults to the project root on local runs.
  cwd?: string;
}

export interface UpdateInfoPlistStepData extends RunsOnMaybeRemote {
  // Plist file path (relative to cwd or absolute).
  plistPath: string;
  // PlistBuddy key path, e.g. ":CFBundleDisplayName" or
  // ":CFBundleURLTypes:0:CFBundleURLSchemes:0".
  key: string;
  // New value (string). Required for set / add-string; ignored for delete.
  value?: string;
  // 'set' (default) errors if the key doesn't exist. 'add-string' errors if
  // it already exists. 'delete' removes the key.
  operation?: 'set' | 'add-string' | 'delete';
  // Working dir for the PlistBuddy call. Defaults to the project root.
  cwd?: string;
}

export interface SwiftlintStepData extends RunsOnMaybeRemote {
  // 'lint' (default) runs `swiftlint lint`. 'fix' runs `swiftlint --fix`
  // (no subcommand) for autocorrect. 'analyze' runs `swiftlint analyze`
  // for rules that need a compile log.
  mode?: 'lint' | 'fix' | 'analyze';
  // Path to .swiftlint.yml — passed via --config when set.
  configFile?: string;
  // One path per line. Each line is shell-quoted and appended verbatim.
  paths?: string;
  // 'true' adds --strict (warnings count as errors).
  strict?: string;
  // Output reporter. Maps to --reporter <r>.
  reporter?: 'xcode' | 'json' | 'junit' | 'markdown' | 'html' | 'emoji';
  // 'true' adds --quiet (suppress non-violation output).
  quiet?: string;
  // Working dir for the swiftlint invocation.
  cwd?: string;
}

export interface SwiftFormatStepData extends RunsOnMaybeRemote {
  // 'lint' (default) runs `swift-format lint <files>` (fails on violations).
  // 'format' runs `swift-format format -i <files>` (in-place rewrite).
  mode?: 'lint' | 'format';
  // Path to .swift-format JSON — passed via --configuration.
  configFile?: string;
  // One path per line. Each line is shell-quoted and appended at the end.
  paths?: string;
  // 'true' (default) adds --recursive (descend into directories).
  recursive?: string;
  // 'true' adds --parallel.
  parallel?: string;
  cwd?: string;
}

export interface XcodebuildAnalyzeStepData extends RunsOnMaybeRemote {
  // Either workspacePath (.xcworkspace) OR projectPath (.xcodeproj). One is
  // required.
  workspacePath?: string;
  projectPath?: string;
  // Required — the xcodebuild scheme to analyze.
  scheme?: string;
  // Defaults to 'Release' to match the canonical CI invocation.
  configuration?: 'Debug' | 'Release';
  // Defaults to 'generic/platform=iOS'.
  destination?: string;
  // Free-form passthrough — split on whitespace and shell-quoted.
  additionalArgs?: string;
  cwd?: string;
}

export interface PeripheryScanStepData extends RunsOnMaybeRemote {
  // Either workspacePath OR projectPath. One is required.
  workspacePath?: string;
  projectPath?: string;
  // Comma-separated; passed straight to `--schemes A,B`.
  schemes?: string;
  // Comma-separated; passed straight to `--targets A,B`.
  targets?: string;
  // Output format. Defaults to 'xcode' so the warnings show up inline in
  // Xcode build logs.
  format?: 'xcode' | 'json' | 'csv' | 'github-actions' | 'checkstyle';
  // 'true' adds --strict (treats unused decls as build errors).
  strict?: string;
  // Path to a .periphery.yml — passed via --config when set.
  configFile?: string;
  additionalArgs?: string;
  cwd?: string;
}

export interface SlatherCoverageStepData extends RunsOnMaybeRemote {
  // Required — slather's trailing positional arg is the .xcodeproj path.
  projectPath?: string;
  // Optional .xcworkspace — passed via --workspace.
  workspacePath?: string;
  // Optional scheme — passed via --scheme.
  scheme?: string;
  // Output format. Maps to one of slather's mutually-exclusive format flags
  // (--html / --json / --cobertura-xml / --simple-output / --sonarqube-xml).
  format?: 'html' | 'json' | 'cobertura' | 'simple' | 'sonarqube';
  // Where slather drops generated reports — passed via --output-directory.
  outputDirectory?: string;
  // DerivedData root — passed via --build-directory.
  buildDirectory?: string;
  additionalArgs?: string;
  cwd?: string;
}

export interface XcovGateStepData extends RunsOnMaybeRemote {
  // Either workspacePath OR projectPath. One is required.
  workspacePath?: string;
  projectPath?: string;
  // Required — the xcov scheme.
  scheme?: string;
  // Where xcov drops its HTML/JSON report. Defaults to 'xcov_report'.
  outputDirectory?: string;
  // Numeric threshold; the build fails below this percent. Defaults to 0.
  minimumCoveragePercentage?: number;
  // Comma-separated. Maps to xcov's --include_targets / --exclude_targets.
  includeTargets?: string;
  excludeTargets?: string;
  // 'true' adds --json_report.
  jsonReport?: string;
  // 'true' adds --markdown_report.
  markdownReport?: string;
  additionalArgs?: string;
  cwd?: string;
}

// `fastlane sigh resign` re-codesigns an existing .ipa / .app with a different
// identity + provisioning profile. Common for enterprise repackaging, ad-hoc
// → App Store flips, and white-label app builds. The destination keychain
// must already be unlocked (chain a `keychainUnlock` step before this one).
export interface ResignStepData extends RunsOnMaybeRemote {
  // Path to the .ipa (most common) or .app bundle. Trailing positional arg.
  ipaPath?: string;
  // Full identity string from the keychain, e.g.
  // "Apple Distribution: Acme Corp (ABC123XYZ4)". Passed via --signing_identity.
  signingIdentity?: string;
  // Path to the .mobileprovision file. fastlane sigh resign also accepts the
  // compound "bundle.id1=path1,bundle.id2=path2" form for multi-target apps —
  // pass that string verbatim and it'll forward through.
  provisioningProfile?: string;
  // Override the bundle identifier. --bundle_id.
  bundleId?: string;
  // Override CFBundleDisplayName. --display_name.
  displayName?: string;
  // Path to entitlements .plist. --entitlements.
  entitlements?: string;
  // Specific keychain to use (otherwise security default). --keychain_path.
  keychainPath?: string;
  additionalArgs?: string;
  cwd?: string;
}

// `fastlane snapshot` drives a UI Test bundle across N simulator devices and
// languages, capturing localized screenshots. Defaults can also live in a
// Snapfile checked into the project root, in which case all of these fields
// are optional. https://docs.fastlane.tools/actions/snapshot/
export interface SnapshotStepData extends RunsOnMaybeRemote {
  // --output_directory <dir>. Defaults to 'screenshots' if blank.
  outputDirectory?: string;
  // 'true' adds --output_simulator_logs.
  outputSimulatorLogs?: string;
  // --ios_version <ver>.
  iosVersion?: string;
  // --scheme <name>. Required by snapshot at runtime unless a Snapfile
  // supplies it; the builder doesn't enforce — the Snapfile may fill in.
  scheme?: string;
  // Either workspacePath OR projectPath. Both optional — Snapfile may fill in.
  workspacePath?: string;
  projectPath?: string;
  // Comma-separated, e.g. "iPhone 16 Pro,iPad Pro". Forwarded as a single
  // --devices arg (fastlane parses the comma list).
  devices?: string;
  // Comma-separated, e.g. "en-US,fr-FR". Forwarded as one --languages arg.
  languages?: string;
  // Multiline — one launch arg per line. Each becomes a separate
  // --launch_arguments <arg> flag (snapshot supports repeating it).
  launchArguments?: string;
  // 'true' adds --clear_previous_screenshots.
  clearPreviousScreenshots?: string;
  additionalArgs?: string;
  cwd?: string;
}

// ── Android steps ───────────────────────────────────────────────────────────
// Drive `./gradlew` (or `gradlew.bat` on Windows) to produce an APK or AAB
// from a standard Android Gradle project. Auto-discovers the resulting
// artifact in app/build/outputs and registers it as a build artifact so
// downstream `adbInstall` / `s3Upload` steps can find it.
export interface GradleBuildStepData {
  // 'apk'   → assemble<Variant>  (installable on device — use this for adb)
  // 'aab'   → bundle<Variant>    (Play Store / Firebase distribution)
  // 'custom'→ run an arbitrary gradle task (gradleTask field)
  output: 'apk' | 'aab' | 'custom';
  // Variant case is significant: gradle generates assembleRelease, not
  // assemblerelease. Defaults to 'Release'.
  variant?: string;
  // Module path; defaults to ':app'. Set to empty string for root project.
  module?: string;
  // Used only when output === 'custom'. Full task name including ':' segments,
  // e.g. ':app:assembleStagingDebug' or ':lib:test'.
  gradleTask?: string;
  // Extra flags forwarded after the task, e.g. '--info --no-daemon'.
  gradleArgs?: string;
  // Working dir relative to project root (where gradlew lives). Empty = root.
  cwd?: string;
  // 'true' (default) → on success, scan app/build/outputs and register the
  // produced APK/AAB as a build artifact. Set to 'false' for custom tasks
  // that don't produce an installable artifact.
  registerArtifact?: string;
}

// `adb connect <host:port>` — pairs a Wi-Fi-debugging-enabled device with the
// adb server. The device must already be authorized (USB-paired or, on
// Android 11+, paired via `adb pair` — the latter is not yet a step).
export interface AdbConnectStepData {
  // ip:port. Default adbd port is 5555.
  address: string;
  // Override 'adb' lookup if it's not on PATH.
  adbPath?: string;
}

// `adb install -r <apk>` onto a connected device. With multiple devices
// connected, supply `serial` (from `adb devices`) to disambiguate; otherwise
// adb will refuse to install with "more than one device".
export interface AdbInstallStepData {
  // APK path relative to project root or absolute. AABs are not installable
  // directly — convert with bundletool first (future step).
  apkPath: string;
  // Specific device serial. Empty = let adb pick (works for single-device
  // setups). Use the value from `adb devices` (e.g. "emulator-5554" or "RFCM…").
  serial?: string;
  // 'true' (default) → -r (reinstall, keeping data). False reinstalls fail
  // when the package is already present.
  replace?: string;
  // 'true' → -d (allow version downgrade for debug builds).
  allowDowngrade?: string;
  // 'true' → -t (allow test packages with android:testOnly="true").
  allowTest?: string;
  adbPath?: string;
}

// `adb shell am start -n <package>/<activity>` — launches the freshly
// installed app. The most common follow-up to adbInstall.
export interface AdbShellLaunchStepData {
  packageName: string;
  // Activity component. Either '.MainActivity' (relative — package gets
  // prefixed) or fully qualified 'com.example.app.MainActivity'. Empty =
  // launch the package's main launcher activity via `monkey`.
  activity?: string;
  serial?: string;
  // 'true' → -W flag, blocks until launch completes (gives a clearer signal
  // for "did it actually start"). Default false (returns immediately).
  waitForLaunch?: string;
  adbPath?: string;
}

// `adb logcat` for a bounded duration, written to a file and registered as a
// build artifact. Standard smoke-test post-launch step: install → launch →
// capture 30s of logs → fail the pipeline if a crash signature appears
// (future enhancement; currently captures only).
// Stream the iOS system log from a connected device for N seconds via
// `idevicesyslog` (libimobiledevice). The on-disk output is registered as
// a build artifact unless `registerArtifact` is 'false'.
//
// Counterpart of `AdbLogcatStepData` for the Android side — keep the field
// names aligned where possible so a single dashboard view can speak both.
export interface IosDeviceLogStepData {
  // Seconds to capture. Default 30.
  durationSec?: number;
  // Target a specific iOS device by UDID. Leave blank for single-device.
  udid?: string;
  // 'true' → connect to a network (Wi-Fi) device. Default 'false'.
  network?: string;
  // 'true' (default) → idevicesyslog -x, exit when the device disconnects.
  // Set 'false' to keep waiting for reconnect within the duration window.
  exitOnDisconnect?: string;
  // 'true' (default) → idevicesyslog --no-colors. Strips ANSI escapes from
  // the on-disk log (so grep / tail render cleanly).
  noColors?: string;
  // idevicesyslog -m STRING: only keep lines CONTAINING this. Common values:
  //   "Zooyale"            → only your app's syslog lines
  //   "<Error>"            → all errors across the system
  match?: string;
  // idevicesyslog -M STRING: only keep lines NOT containing this. Useful
  // for filtering out chatty system services.
  unmatch?: string;
  // Output file path relative to project root. Default
  // "ios-syslog-<buildId>.txt". Registered as a build artifact when
  // registerArtifact is 'true' (default).
  outputPath?: string;
  // 'true' (default) → register the output file as a build artifact.
  registerArtifact?: string;
  // Override the idevicesyslog binary path. Default: `idevicesyslog`
  // (must be on PATH; install via `brew install libimobiledevice`).
  idevicesyslogPath?: string;
}

export interface AdbLogcatStepData {
  // Seconds to capture. Default 30.
  durationSec?: number;
  serial?: string;
  // Optional logcat filter spec. Examples:
  //   "*:E"                → errors only across all tags
  //   "MyApp:D *:S"        → only MyApp tag at Debug+
  //   "--pid=$(adb shell pidof -s com.example.app)"  → not supported here;
  //                                                    use a shell step.
  filter?: string;
  // Output file path relative to project root. Default
  // "logcat-<buildId>.txt". The file is registered as a build artifact when
  // registerArtifact is 'true' (default).
  outputPath?: string;
  // 'true' (default) → adb logcat -c (clear ring buffer) before starting.
  // Highly recommended so you only get logs from this run.
  clearFirst?: string;
  // 'true' (default) → register the output file as a build artifact.
  registerArtifact?: string;
  adbPath?: string;
}

// `adb pair <host:port>` — Android 11+ Wi-Fi debugging needs a one-time
// pairing handshake with a 6-digit code shown in the device's developer
// settings. After pairing, the standard `adb connect` is used.
export interface AdbPairStepData {
  // ip:port reported by the device's Wireless Debugging → Pair with code dialog.
  // NOTE this is the *pairing* port, not the *connect* port (different ports).
  address: string;
  // 6-digit code shown on-device. Required.
  pairingCode: string;
  adbPath?: string;
}

// `bundletool build-apks` / `install-apks` — converts an .aab into a set of
// installable APKs (a .apks zip) and optionally installs them onto a
// connected device. Required when you build an `.aab` via `gradleBuild` but
// need to install it for local smoke testing (`adb install` won't accept
// AABs directly).
export interface BundletoolStepData {
  // build-apks (default) generates the .apks. install-apks installs it.
  action?: 'build-apks' | 'install-apks';
  // Source .aab. Required for build-apks; ignored for install-apks.
  bundlePath?: string;
  // Where to write the .apks (build-apks) or where to read it from (install-apks).
  apksPath: string;
  // Path to a signing keystore (.jks / .keystore). Required when build-apks
  // for release distribution — omit for debug builds and bundletool will
  // accept the unsigned mode but adb install on most devices will reject the
  // resulting APKs.
  keystorePath?: string;
  androidKeystorePassword?: string;
  keyAlias?: string;
  androidKeyPassword?: string;
  // 'true' → --mode=universal (one APK per architecture).
  universalMode?: string;
  // Specific device serial for install-apks.
  serial?: string;
  // Path to the bundletool jar; defaults to `bundletool` on PATH (i.e. the
  // pip-installable wrapper / homebrew bundletool that auto-resolves java).
  bundletoolPath?: string;
  // Extra args passed verbatim after the action / inputs.
  additionalArgs?: string;
}

// `apksigner sign` (default) or `jarsigner -verify` — codesign an unsigned
// APK with a v1/v2/v3/v4 signature scheme. Most teams now sign in the
// gradle build via signingConfigs; this step exists for the standalone case
// (Unity exports, Cordova builds, repackaging an existing APK).
export interface AndroidSignStepData {
  // 'sign' (default) signs the apk in place. 'verify' runs apksigner verify
  // for a pre-flight gate. 'jarsign' falls back to jarsigner for legacy
  // v1-only signatures.
  action?: 'sign' | 'verify' | 'jarsign';
  // APK to sign (or to read for verify).
  apkPath: string;
  // Output path. Defaults to overwriting apkPath when blank.
  outputPath?: string;
  // Java keystore (.jks / .keystore). Required for sign + jarsign.
  keystorePath?: string;
  androidKeystorePassword?: string;
  keyAlias?: string;
  androidKeyPassword?: string;
  // Signature scheme toggles (apksigner). Each defaults to apksigner's own
  // default (v1+v2+v3 enabled on modern Android Build Tools).
  v1?: string;
  v2?: string;
  v3?: string;
  v4?: string;
  // Path to apksigner / jarsigner if not on PATH. apksigner ships with
  // Android Build Tools (e.g. $ANDROID_HOME/build-tools/<ver>/apksigner).
  apksignerPath?: string;
  jarsignerPath?: string;
  additionalArgs?: string;
}

// `curl`-driven Google Play Developer API v3 upload. Stays JWT-free by
// leaning on a service-account .json key (the standard Play setup) and
// asking google's OAuth token endpoint for a short-lived token, then
// driving the standard 4-step Edits API (insert → upload → tracks.update →
// commit). Implementation lives in the runner; this shape is just the form.
export interface PlayConsoleUploadStepData {
  packageName: string;
  // Path OR raw JSON contents of a service-account key (.json). The runner
  // accepts either — service accounts must have the "Service Account User"
  // role on the Play Console and be granted Release-manager on the app.
  serviceAccountJsonPath?: string;
  playServiceAccountJson?: string;
  // Path to the artifact: .aab (preferred) or .apk.
  binaryPath: string;
  // 'internal' (default) | 'alpha' | 'beta' | 'production'.
  track?: string;
  // 'completed' (default — fully rolled out) | 'inProgress' | 'halted' |
  // 'draft' (no rollout). When 'inProgress', userFraction must be set.
  status?: string;
  // 0..1 (default unset; required when status='inProgress').
  userFraction?: number;
  // Release notes per locale. One-per-line "lang=text" form, e.g.
  //   en-US=Bug fixes and improvements
  //   tr-TR=Hata düzeltmeleri
  releaseNotes?: string;
}

// Common shape shared by every App Store Connect API-driven step. The
// runner signs an ES256 JWT from the .p8 (path or contents) and hits ASC
// directly — no `xcrun altool` shell-out needed.
export interface AscApiCredentials {
  // Provide ONE: a path to the .p8 OR the PEM contents pasted into the field.
  apiKeyPath?: string;
  apiKeyContents?: string;
  // 8-character key id from the Users + Access → Keys page in ASC.
  keyId: string;
  // Issuer UUID from the same page.
  issuerId: string;
}

export interface AppStoreConnectApiStepData extends AscApiCredentials {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  // JSON-encoded query params, e.g. {"filter[type]":"APPLE_TV_OS"}
  queryJson?: string;
  // JSON-encoded request body — used for POST / PATCH.
  bodyJson?: string;
}

export interface TestflightSetWhatToTestStepData extends AscApiCredentials {
  // Either pass the build id directly, or look it up by app + version + build #.
  buildId?: string;
  appBundleId?: string;
  // Marketing version, e.g. "1.4.0" — matched on preReleaseVersion.version.
  version?: string;
  // CFBundleVersion (build number), e.g. "42" — matched on builds.version.
  buildNumber?: string;
  // BCP-47 locale id, e.g. "en-US". Defaults to en-US when blank.
  locale?: string;
  // The "What to Test" text shown to TestFlight reviewers + testers.
  whatsNew: string;
}

export interface TestflightPublicLinkStepData extends AscApiCredentials {
  appBundleId: string;
  // BetaGroup name to use (will be created with publicLinkEnabled=true if
  // missing). Defaults to "Public" when blank.
  groupName?: string;
  // Optional — when set, attaches this build to the public group so the
  // public link starts handing out this version.
  buildId?: string;
}

export interface TestflightManageStepData extends AscApiCredentials {
  action?: 'inviteTester' | 'removeTester' | 'listTesters' | 'addToGroup' | 'removeFromGroup';
  // Required for inviteTester / listTesters / addToGroup / removeFromGroup.
  appBundleId?: string;
  // Required for tester ops (the email is the lookup key in ASC).
  testerEmail?: string;
  testerFirstName?: string;
  testerLastName?: string;
  // Required for addToGroup / removeFromGroup; optional on inviteTester
  // (when set, adds the new tester to the named group on creation).
  groupName?: string;
}

export interface AppStorePrecheckStepData extends RunsOnMaybeRemote {
  appIdentifier: string;
  username?: string;
  teamId?: string;
  // 'true' includes IAPs in the lint pass (default: skipped — IAPs lint
  // separately via `precheck --include_in_app_purchases true`).
  includeInAppPurchases?: string;
  // Default precheck rule verdict when no per-rule level is configured.
  // Values: 'warn' | 'error' | 'skip'.
  defaultRule?: string;
  additionalArgs?: string;
  cwd?: string;
}

export interface AppStoreCreateStepData extends AscApiCredentials {
  bundleId: string;
  name: string;
  sku: string;
  // BCP-47, e.g. "en-US".
  primaryLocale: string;
  // Used when registering the bundleId on the Developer Portal: 'IOS' | 'MAC_OS'.
  platform?: 'IOS' | 'MAC_OS' | 'UNIVERSAL';
  // Comma-separated platform list for the App record itself, e.g. "IOS,MAC_OS".
  // When unset, falls back to `platform`.
  platforms?: string;
  // 'true' — register the bundleId on the Dev Portal if it doesn't exist
  // yet. Otherwise we error out so the user makes the call explicitly.
  registerBundleId?: string;
}

export interface AppStoreUploadStepData extends RunsOnMaybeRemote {
  appIdentifier: string;
  ipaPath?: string;
  metadataPath?: string;
  screenshotsPath?: string;
  username?: string;
  teamId?: string;
  // 'true' skips upload of the .ipa binary (metadata-only delivery).
  skipBinaryUpload?: string;
  skipMetadata?: string;
  skipScreenshots?: string;
  // 'true' submits for App Store review after upload completes.
  submitForReview?: string;
  // 'true' — release automatically once review approves.
  automaticRelease?: string;
  // 'true' bypasses the metadata-changes confirmation prompt (CI-required).
  force?: string;
  additionalArgs?: string;
  cwd?: string;
}

export interface BuildAppGymStepData extends RunsOnMaybeRemote {
  workspacePath?: string;
  projectPath?: string;
  scheme: string;
  // Defaults to Release when blank.
  configuration?: string;
  // 'app-store' | 'ad-hoc' | 'enterprise' | 'development' | 'developer-id' | 'mac-application'
  exportMethod?: string;
  exportOptionsPlist?: string;
  outputDirectory?: string;
  outputName?: string;
  includeBitcode?: string;
  // 'false' to omit dSYMs from the output ipa.
  includeSymbols?: string;
  cleanBeforeBuild?: string;
  // 'true' adds --silent (suppress xcpretty output).
  silent?: string;
  skipPackageIpa?: string;
  skipArchive?: string;
  additionalArgs?: string;
  cwd?: string;
}

export interface PushCertificateStepData extends RunsOnMaybeRemote {
  appIdentifier: string;
  username?: string;
  teamId?: string;
  // 'true' generates a development APNs cert; default = production.
  development?: string;
  // 'false' to skip the .p12 export (only the .pem is dropped).
  generateP12?: string;
  // .p12 export password (encrypted at rest).
  password?: string;
  // Output dir; defaults to fastlane's default (project root).
  outputPath?: string;
  // 'true' regenerates even when the existing cert hasn't expired.
  force?: string;
  // pem renews automatically when the cert expires within N days.
  activeDaysLimit?: number | string;
  additionalArgs?: string;
  cwd?: string;
}

export interface CertManageStepData extends RunsOnMaybeRemote {
  // 'true' fetches a development cert; default = production.
  development?: string;
  appIdentifier?: string;
  username?: string;
  teamId?: string;
  outputPath?: string;
  keychainPath?: string;
  keychainPassword?: string;
  // ios | macos | catalyst — defaults to ios.
  platform?: string;
  force?: string;
  additionalArgs?: string;
  cwd?: string;
}

export interface RegisterDevicesStepData extends AscApiCredentials {
  // Multiline. Each line is either "Name=UDID" or "UDID" (auto-named).
  // Lines starting with # are comments.
  udids: string;
  platform?: 'IOS' | 'MAC_OS';
}

export interface SighStepData extends RunsOnMaybeRemote {
  // sigh sub-action.
  action?: 'download' | 'renew' | 'repair' | 'manage';
  appIdentifier?: string;
  username?: string;
  teamId?: string;
  // appstore (default) | adhoc | development | developer_id
  profileType?: 'appstore' | 'adhoc' | 'development' | 'developer_id';
  outputPath?: string;
  // 'true' regenerates even when an existing profile is reusable.
  force?: string;
  // 'true' adds --skip_install — by default sigh installs the .mobileprovision.
  skipInstall?: string;
  // ios (default) | tvos | macos
  platform?: string;
  additionalArgs?: string;
  cwd?: string;
}

// Phase 6.A — `xcrun simctl` simulator lifecycle.
export interface SimctlPrepareStepData extends RunsOnMaybeRemote {
  // boot | shutdown | erase | create | shutdownAll | eraseAll
  action?: string;
  // UDID for boot/shutdown/erase. Empty defaults to "booted".
  udid?: string;
  deviceName?: string;
  // create only — device type identifier, e.g.
  // 'com.apple.CoreSimulator.SimDeviceType.iPhone-16'.
  deviceType?: string;
  // create only — runtime identifier, e.g.
  // 'com.apple.CoreSimulator.SimRuntime.iOS-18-0'.
  runtime?: string;
  additionalArgs?: string;
  cwd?: string;
}

export interface SimctlInstallLaunchStepData extends RunsOnMaybeRemote {
  // install | launch | terminate | uninstall | installAndLaunch (default)
  action?: string;
  udid?: string;
  appPath?: string;
  bundleId?: string;
  waitForDebugger?: string;
  console?: string;
  launchArgs?: string;
}

export interface SimctlScreenshotStepData extends RunsOnMaybeRemote {
  mode?: 'screenshot' | 'recordVideo';
  udid?: string;
  outputPath: string;
  // screenshot only: png | jpeg | tiff
  type?: string;
  // screenshot + recordVideo
  display?: string;
  mask?: string;
  // recordVideo only
  codec?: string;
  force?: string;
  additionalArgs?: string;
  cwd?: string;
}

export interface SimctlPushNotificationStepData extends RunsOnMaybeRemote {
  udid?: string;
  bundleId?: string;
  // Provide ONE: payloadJson (we drop into a temp .apns file) or payloadPath.
  payloadJson?: string;
  payloadPath?: string;
}

export interface SimctlStatusBarOverrideStepData extends RunsOnMaybeRemote {
  // override (default) | clear | list
  action?: 'override' | 'clear' | 'list';
  udid?: string;
  time?: string;
  dataNetwork?: string;
  wifiMode?: string;
  wifiBars?: number | string;
  cellularMode?: string;
  cellularBars?: number | string;
  operatorName?: string;
  batteryState?: string;
  batteryLevel?: number | string;
}

export interface SimctlPrivacyGrantStepData extends RunsOnMaybeRemote {
  // grant (default) | revoke | reset
  action?: 'grant' | 'revoke' | 'reset';
  udid?: string;
  // all | calendar | contacts | location | microphone | photos | etc.
  service: string;
  bundleId?: string;
}

// Phase 6.B — codesign / keychain / dsym helpers.
export interface SecurityKeychainImportStepData extends RunsOnMaybeRemote {
  filePath: string;
  filePassword?: string;
  keychain?: string;
  keychainPassword?: string;
  // 'true' (default) — apply -A so the imported key is accessible to all apps.
  allowAccess?: string;
  // Comma/newline separated codesign / xcodebuild paths to allow without UI.
  allowedTools?: string;
  // priv | pub | cert | agg | seq — passed via -t.
  fileType?: string;
  // openssl | bsafe | pemseq | wrapped | x509 | pkcs7 | pkcs8 | pkcs12 — passed via -f.
  fileFormat?: string;
  // -S apple-tool:,apple: by default — fixes the codesign UI prompt.
  partitionList?: string;
  // 'true' — skip the partition-list step (use when the import alone is enough).
  skipPartitionList?: string;
}

export interface CodesignArbitraryStepData extends RunsOnMaybeRemote {
  targetPath: string;
  identity: string;
  entitlementsPath?: string;
  // 'false' to skip --force.
  force?: string;
  preserveMetadata?: string;
  // 'none' to disable timestamping; URL or 'true' to use Apple TSA.
  timestamp?: string;
  options?: string;
  requirements?: string;
  additionalArgs?: string;
  cwd?: string;
}

export interface DsymVerifyStepData extends RunsOnMaybeRemote {
  binaryPath: string;
  dsymPath: string;
}

// Phase 6.C — privacy manifests.
export interface PrivacyManifestValidateStepData extends RunsOnMaybeRemote {
  manifestPath: string;
  // Optional path to the binary; when set, scan symbols for required-reason
  // API references and warn (or fail with strict=true) when categories are missing.
  binaryPath?: string;
  // 'true' fails the step on missed categories; 'false' warns only.
  strict?: string;
}

export interface PrivacyManifestAggregateStepData extends RunsOnMaybeRemote {
  // Directory to scan for PrivacyInfo.xcprivacy files. Typically Pods/.
  scanRoot: string;
  outputPath: string;
  // 'true' to overwrite an existing aggregate manifest; default skip.
  overwrite?: string;
}

// Phase 6.D — performance/size analysis.
export interface AppThinningReportParseStepData {
  reportPath: string;
  baselineReportPath?: string;
  // Fail the step when worst variant grew more than this percent.
  maxAppGrowthPct?: number | string;
}

export interface LinkMapAnalyzeStepData {
  mapPath: string;
  topN?: number | string;
}

export interface BitcodeStripStepData extends RunsOnMaybeRemote {
  inputPath: string;
  outputPath?: string;
  // remove (default) | leave | markerOnly
  mode?: 'remove' | 'leave' | 'markerOnly';
}

// Phase 6.E — distribution.
export interface OtaManifestGenerateStepData {
  bundleId: string;
  bundleVersion: string;
  title: string;
  ipaUrl: string;
  outputPath: string;
  icon57Url?: string;
  icon512Url?: string;
  subtitle?: string;
  // Optional. When set, the step logs an itms-services:// install link
  // pointing at <installUrlBase>/<filename(outputPath)>.
  installUrlBase?: string;
}

export interface FirebaseAppDistributionStepData extends RunsOnMaybeRemote {
  appId: string;
  binaryPath: string;
  // Auth: provide either a service account key path (preferred) OR a
  // refresh token via FIREBASE_TOKEN.
  serviceAccountPath?: string;
  firebaseToken?: string;
  // Comma-separated tester groups + emails.
  groups?: string;
  testers?: string;
  releaseNotes?: string;
  releaseNotesFile?: string;
  additionalArgs?: string;
  cwd?: string;
}

export interface DistributionGroupsStepData extends AscApiCredentials {
  // list | reconcile | inviteEmail (default: list)
  action?: 'list' | 'reconcile' | 'inviteEmail';
  appBundleId: string;
  // Multiline spec. Example:
  //   [Internal]
  //   alice@example.com
  //   bob@example.com
  //
  //   [QA]
  //   carol@example.com
  spec?: string;
  // 'true' deletes testers in the group that aren't in the desired list.
  removeStrangers?: string;
  dryRun?: string;
}

export interface PhasedRolloutStepData extends AscApiCredentials {
  // start | pause | resume | complete
  action?: 'start' | 'pause' | 'resume' | 'complete';
  appStoreVersionId: string;
}

export interface BranchTargetedTestFlightStepData extends AscApiCredentials {
  appBundleId: string;
  buildId: string;
  // Override the trigger branch (otherwise pulled from build.triggerBranch).
  branchOverride?: string;
  // Multiline mapping. Each line: `branch-pattern => GroupName`.
  // Pattern supports literal text + * (any) + ? (single) wildcards, or
  // /regex/ form for arbitrary regexp.
  mapping?: string;
  // Used when no mapping line matches. Step errors when both empty.
  defaultGroup?: string;
  // 'true' creates the BetaGroup if it doesn't exist on the app.
  createMissingGroup?: string;
}

// Phase 6.F — StoreKit.
export interface StorekitConfigureStepData extends RunsOnMaybeRemote {
  // Path to .storekit configuration file.
  storekitPath: string;
}

// Phase 6.5 — Steam.
export interface SteamcmdSetupStepData extends RunsOnMaybeRemote {
  installDir: string;
  // 'auto' (default) | 'windows' | 'linux' | 'macos' — controls the
  // download URL + extract command.
  platform?: string;
  // Optional Steam Guard cache. Both must be base64-encoded contents of
  // the original sentry/ssfn files; we drop them next to steamHomeDir.
  sentryFileBase64?: string;
  ssfnFileBase64?: string;
  ssfnFileName?: string;
  steamHomeDir?: string;
  configVdfPath?: string;
}

export interface SteamUploadStepData extends RunsOnMaybeRemote {
  steamcmdPath?: string;
  username: string;
  password: string;
  steamGuardCode?: string;
  // Provide ONE: a path to an existing VDF file, OR the inputs to generate
  // one (appId + contentRoot + depots).
  vdfPath?: string;
  appId?: string;
  description?: string;
  contentRoot?: string;
  buildOutput?: string;
  // SetLive branch — leave blank to upload without promoting.
  setLive?: string;
  preview?: string;
  // Multiline. Each line: `<depotId>:<localPath>[:<depotPath>][:<recursive>]`
  depots?: string;
}

export interface SteamSetLiveStepData {
  steamWebApiKey: string;
  appId: string;
  buildId: string;
  branch: string;
  description?: string;
  // For testing against a recorded mock — leave blank in production.
  baseUrl?: string;
}

export interface SteamWorkshopUploadStepData extends RunsOnMaybeRemote {
  steamcmdPath?: string;
  username: string;
  password: string;
  steamGuardCode?: string;
  appId: string;
  // "0" creates a new Workshop item.
  itemId?: string;
  contentFolder: string;
  previewFile?: string;
  title?: string;
  description?: string;
  changeNote?: string;
  // 0 public | 1 friends | 2 private
  visibility?: '0' | '1' | '2';
}

// Microsoft Teams incoming webhook step. Supports the legacy O365 connector
// surface (text-only or MessageCard) plus a `raw` escape hatch where the user
// pastes an Adaptive Card JSON for Power Automate Workflow webhooks (legacy
// connectors are being deprecated in October 2025).
export interface TeamsNotifyStepData {
  webhookUrl: string;
  text: string;
  // 'simple' (default)  → { "text": "..." } — the universal-fallback shape.
  // 'messageCard'       → MessageCard with title + themeColor.
  // 'raw'               → forward `text` verbatim (must be valid JSON).
  format?: 'simple' | 'messageCard' | 'raw';
  // Used only by format=messageCard.
  title?: string;
  // Hex without '#'. Used only by format=messageCard.
  themeColor?: string;
}

// First-class transactional email step. Uses nodemailer at runtime via dynamic
// import; the package is an optional peer dep that the operator installs once
// in apps/server. Field-level secrets (smtpPassword) are encrypted at rest.
export interface EmailNotifyStepData {
  // SMTP server. Most providers: smtp.gmail.com, smtp.office365.com,
  // smtp.sendgrid.net, smtp.mailgun.org, etc.
  smtpHost: string;
  // Default 587 (STARTTLS). Use 465 for TLS-on-connect, 25 for unauthenticated
  // localhost relays.
  smtpPort?: number;
  // 'true' forces TLS-on-connect; 'false' disables. Empty = derive from port
  // (465 → secure, anything else → STARTTLS). Most operators leave blank.
  smtpSecure?: string;
  smtpUser: string;
  // Plaintext on the form; encrypted at rest via SENSITIVE_FIELDS.
  smtpPassword: string;
  // Header values. From must be a verified sender on most providers.
  from: string;
  // Comma / semicolon / whitespace separated. At least one address required.
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  // Provide bodyText OR bodyHtml (or both — multipart). At least one required.
  bodyText?: string;
  bodyHtml?: string;
}

// `fastlane frameit` adds device chrome around raw screenshots. Pure wrapper —
// reads frames from ~/.fastlane/frameit (downloaded on first run).
export interface FrameitStepData extends RunsOnMaybeRemote {
  // Trailing positional. Defaults to './screenshots' when blank.
  pathToScreenshots?: string;
  // Allowlisted via VALID_COLORS at runtime. 'none' = no color flag, the
  // others map to --silver / --gold / --rose_gold / --space_gray.
  colorFlag?: 'none' | 'silver' | 'gold' | 'rose-gold' | 'space-gray';
  // 'true' adds --force (overwrite existing framed images).
  force?: string;
  // 'true' adds --use_legacy_iphone5s.
  useLegacyIphone5s?: string;
  // --use_platform <X>. Typical values: "IOS", "ANDROID", "ANY".
  usePlatform?: string;
  additionalArgs?: string;
  cwd?: string;
}

export interface FastlaneMatchStepData extends RunsOnMaybeRemote {
  // Cert/profile type fastlane match should sync.
  matchType: 'appstore' | 'adhoc' | 'development' | 'enterprise' | 'developer_id';
  // Bundle id(s). Comma-separated when multiple — fastlane accepts that form.
  appIdentifier?: string;
  // Git repo where match stores encrypted certs / profiles. Can also live
  // in Matchfile, in which case leave this blank.
  gitUrl?: string;
  gitBranch?: string;
  // Match's symmetric encryption password. Passed via MATCH_PASSWORD env
  // so it doesn't appear in `ps aux`. Plaintext on the step until the
  // secrets vault lands.
  password?: string;
  // Which keychain certs land in. Empty = login.keychain-db default.
  keychainName?: string;
  keychainPassword?: string;
  // 'true' adds --readonly. Highly recommended for CI — it errors instead
  // of trying to create new certs on the developer portal.
  readonly?: string;
  additionalArgs?: string;
  // 'cwd' for the fastlane invocation. Falls back to the project root on
  // local runs; ignored on remote (use `cd` chains in additionalArgs).
  cwd?: string;
}

// Snapshot of what a saved host can run. Populated lazily by the
// "Test connection" button in HostsDialog and the POST /api/hosts/:id/ping
// endpoint. Used by the editor to badge a host with its Xcode + macOS
// version + architecture.
export interface HostCapabilities {
  // First line of `xcodebuild -version` (e.g. "Xcode 16.1"). Undefined when
  // xcodebuild isn't on PATH for the SSH login shell — the host is
  // probably a Linux box.
  xcodeVersion?: string;
  // `sw_vers -productVersion` (e.g. "14.5"). Undefined on non-macOS hosts.
  macosVersion?: string;
  // `uname -m` (e.g. "arm64", "x86_64"). Always populated on a successful
  // ping; identifies Apple Silicon vs Intel.
  arch?: string;
  // Anything that printed before/after the markers, kept for diagnostics.
  rawSnippet?: string;
  // Unix ms — when the snapshot was taken.
  lastCheckedAt: number;
}

// A reusable SSH host saved in ~/.buildpilot/hosts.json. The dropdown in
// remote-running steps lists these by name so credentials don't have to be
// retyped across pipelines.
export interface SshHost {
  id: string;
  name: string;
  // user@host[:port]
  host: string;
  identityFile?: string | null;
  password?: string | null;
  skipStrictHostKey?: boolean;
  description?: string | null;
  capabilities?: HostCapabilities;
  createdAt: number;
  updatedAt: number;
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
  | { type: 'nodeTemplateChanged'; templateId: string; action: 'created' | 'updated' | 'deleted' }
  | { type: 'hostChanged'; hostId: string; action: 'created' | 'updated' | 'deleted' };

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
  // Phase 4 Cluster D — build retention. When > 0, builds older than N days
  // (and their associated log entries + artifact rows) are pruned on a daily
  // cleanup pass. Set to 0 / omitted to keep everything forever.
  buildRetentionDays?: number;
}

// Shape returned by GET /api/config/telegram. Cleartext values never leave
// the server — we only expose enough for the dashboard to render a preview
// and indicate "a secret is set" vs. "it's empty". The chat ID is treated
// as a secret too because it identifies a private channel.
export interface TelegramConfigPublic {
  enabled: boolean;
  hasBotToken: boolean;
  botTokenPreview: string; // e.g. "••••1234" or ""
  hasChatId: boolean;
  chatIdPreview: string; // e.g. "@channel" or "••••5678" or ""
}

// Body accepted by PUT /api/config/telegram. Any string field left as the
// empty string is interpreted as "keep the existing value" so the dashboard
// can save the form without having to re-type secrets every time.
export interface TelegramConfigUpdate {
  enabled?: boolean;
  botToken?: string; // "" → keep existing
  defaultChatId?: string; // "" → keep existing
  // When true, explicitly clear the stored botToken (overrides "" semantics).
  clearBotToken?: boolean;
  clearChatId?: boolean;
}

// Optional per-pipeline flag exposed on PipelineWatch — when set + a bot
// is configured, new commits trigger an interactive Telegram message
// asking whether to build.
export interface TelegramApprovalConfig {
  enabled: boolean;
  // When unset, falls back to telegram.defaultChatId.
  chatId?: string;
}

// ── Metrics ─────────────────────────────────────────────────────────────────
// Phase 4 Cluster 10.D — metrics-led home dashboard. Response shape for
// `GET /api/metrics/home`. All counts cover *finished* builds unless noted.
export interface HomeMetrics {
  // Builds currently in `pending` or `running` state.
  runningBuildsCount: number;
  // Number of finished builds in the trailing 24h window.
  builds24h: number;
  // success / failed / cancelled breakdown for the same 24h window.
  successes24h: number;
  failures24h: number;
  cancelled24h: number;
  // 0..1 — successes24h / (successes24h + failures24h). Null when no
  // success+failure finished in the window (the UI can render "—").
  successRate24h: number | null;
  // Most recent 5 *failed* builds.
  recentFailures: HomeMetricsRecentBuild[];
  // Top 5 pipelines by average duration over their most recent up-to-30
  // successful builds.
  slowestPipelines: HomeMetricsSlowestPipeline[];
  // Disk usage snapshot. `bytes` is the sum of `build_artifacts.size`.
  diskUsage: {
    totalBytes: number;
    artifactCount: number;
    buildCount: number;
  };
}

export interface HomeMetricsRecentBuild {
  id: string;
  pipelineId: string;
  pipelineName: string;
  projectId: string;
  projectName: string;
  status: BuildStatus;
  triggerSha: string;
  triggerBranch: string;
  startedAt: number;
  finishedAt: number | null;
  durationMs: number | null;
}

export interface HomeMetricsSlowestPipeline {
  pipelineId: string;
  pipelineName: string;
  projectId: string;
  projectName: string;
  // Average duration of the up-to-30 most recent successful builds, in ms.
  avgDurationMs: number;
  sampleCount: number;
}

// `GET /api/metrics/pipeline/:id` — duration P50/P95 sparkline + step
// duration breakdown over the last 30 builds for a single pipeline.
export interface PipelineMetrics {
  pipelineId: string;
  pipelineName: string;
  // Up-to-30 most recent finished builds, oldest → newest, for sparklines.
  recentBuilds: PipelineMetricsBuild[];
  // P50 / P95 over `recentBuilds` where the build has a finishedAt.
  durationP50Ms: number | null;
  durationP95Ms: number | null;
  // Top 5 step types by average duration (descending). Computed from
  // build_log_entries (▶ step started → ✔ step ok / ✖ step failed) over
  // the same sample set.
  slowestSteps: PipelineMetricsStep[];
}

export interface PipelineMetricsBuild {
  id: string;
  status: BuildStatus;
  startedAt: number;
  finishedAt: number | null;
  durationMs: number | null;
}

export interface PipelineMetricsStep {
  // Node id (stable within a pipeline) — also returned so the editor can
  // highlight the actual node.
  nodeId: string;
  // The step type (e.g. `shell`, `unityBatch`). Useful as a label when the
  // node has no human-readable name.
  stepType: StepType;
  avgDurationMs: number;
  maxDurationMs: number;
  sampleCount: number;
}

// `GET /api/metrics/disk-usage` — per-pipeline artifact byte breakdown so
// the Disk Usage page can show where space goes. `pipelines` are sorted
// descending by bytes.
export interface DiskUsageReport {
  totalBytes: number;
  artifactCount: number;
  buildCount: number;
  pipelines: DiskUsagePipelineEntry[];
  // Artifacts whose owning build was pruned (orphaned rows). They still
  // consume bytes and can be cleaned up by re-running prune.
  orphanBytes: number;
  orphanArtifactCount: number;
}

export interface DiskUsagePipelineEntry {
  pipelineId: string;
  pipelineName: string;
  projectId: string;
  projectName: string;
  bytes: number;
  artifactCount: number;
  buildCount: number;
}

// Response shape for `POST /api/builds/prune?olderThanDays=N`.
export interface PruneBuildsResponse {
  cutoffMs: number;
  builds: number;
  logEntries: number;
  artifacts: number;
}

// ── Cluster 11.F · Observability deep dive ─────────────────────────────────
// Test report tree returned by `GET /api/builds/:id/test-report`. Both
// xcresult (parsed via `xcrun xcresulttool`) and JUnit XML files collapse
// to this shape so the UI doesn't care which format produced it. When the
// server can't parse (e.g. xcresult on a non-macOS host), it returns an
// empty `suites` array plus a `note` explaining why so the UI can show
// the reason rather than a silent empty state.
export type TestReportKind = 'xcresult' | 'junit';

export type TestStatus = 'passed' | 'failed' | 'skipped';

export interface TestCase {
  name: string;
  // Optional suite-qualified class/identifier for click-to-jump deep-linking
  // ("MyApp.LoginViewSpec" etc.). UI uses it as the secondary line on each
  // row.
  classname?: string;
  status: TestStatus;
  // Duration in seconds (matches JUnit `time=` attribute semantics).
  durationSec?: number;
  // Failure / error message captured at parse time. Undefined for passed
  // tests. May include the full stack trace; the UI truncates with a
  // "show more" toggle.
  message?: string;
  // Best-effort source location ("Tests/Login/LoginViewSpec.swift:42") so
  // the UI can render a deep-link. Surfaced from JUnit `file`/`line`
  // attributes or xcresult test issues when present.
  file?: string;
  line?: number;
}

export interface TestSuite {
  name: string;
  // Sum of child test durations in seconds. JUnit ships this on the
  // `<testsuite time=>` attribute directly; for xcresult we sum children.
  timeSec?: number;
  tests: TestCase[];
}

export interface TestReportTree {
  // The artifact this report was parsed from (relative path + DB id) so
  // the UI can offer a "Download xcresult bundle" / "View raw XML" link.
  artifactId: number | null;
  artifactPath: string | null;
  kind: TestReportKind;
  // Totals across all suites — server pre-computes so each client doesn't
  // have to walk the tree.
  totalTests: number;
  totalPassed: number;
  totalFailed: number;
  totalSkipped: number;
  // Sum of all suite `timeSec` values (may be 0 if the source XML had no
  // timing). Optional so a non-timing JUnit doesn't lie about duration.
  totalDurationSec: number | null;
  suites: TestSuite[];
  // Filled in when parsing was skipped — e.g. xcresult bundle on a Linux
  // host. Empty suites + a note lets the UI explain the situation cleanly.
  note?: string;
}

// `GET /api/builds/:id/coverage` — Cobertura-format coverage parsed from the
// `coverage.xml` artifact produced by the slatherCoverage step. We surface
// the overall line-coverage rate plus the top-5 lowest-covered files so
// the build detail can show a small panel without rendering the full
// per-line HTML report.
export interface CoverageReport {
  artifactId: number | null;
  artifactPath: string | null;
  // 0..1 — the Cobertura `<coverage line-rate=>` root attribute. Null when
  // the file is unparseable (the UI shows "—" rather than 0%).
  lineRate: number | null;
  // 0..1 — branch coverage when present. Many slather configurations omit
  // it; null in that case.
  branchRate: number | null;
  // Total lines covered / total lines instrumented across all files.
  linesCovered: number;
  linesValid: number;
  // Bottom-5 by line-rate, ascending. Each entry has the source path and
  // its own line-rate so we can render a "files most in need of tests"
  // shortlist.
  lowestFiles: Array<{ filename: string; lineRate: number; lines: number }>;
  note?: string;
}

// `GET /api/flaky-tests?buildCount=30&pipelineId=...` — aggregates test
// pass/fail across recent builds and flags tests whose failure rate is
// strictly between 0 and 1 (i.e. they pass sometimes and fail others).
export interface FlakyTestEntry {
  // Stable key the UI uses to toggle quarantine: "<classname>::<name>" or
  // just "<name>" when classname is missing.
  testKey: string;
  name: string;
  classname?: string;
  runs: number;
  passes: number;
  failures: number;
  skips: number;
  // failures / (passes + failures); 0..1. Null when (passes+failures) is 0.
  failureRate: number | null;
  // Most recent run we saw this test in, for the "last seen" column.
  lastSeenAt: number;
  // Whether the user marked it quarantined on the owning pipeline.
  quarantined: boolean;
}

export interface FlakyTestsReport {
  pipelineId: string;
  pipelineName: string;
  projectId: string;
  projectName: string;
  // Number of builds inspected (may be less than `buildCount` when the
  // pipeline is young).
  buildsAnalyzed: number;
  // Returned sorted by failureRate descending, then runs descending.
  flaky: FlakyTestEntry[];
}

// `POST /api/flaky-tests/:pipelineId/quarantine` body.
export interface FlakyQuarantineUpdate {
  testKey: string;
  quarantined: boolean;
}
