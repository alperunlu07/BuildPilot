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
  | 'frameit';

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
  backend: 'crashlytics' | 'sentry' | 'bugsnag';
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
}

// Optional per-pipeline flag exposed on PipelineWatch — when set + a bot
// is configured, new commits trigger an interactive Telegram message
// asking whether to build.
export interface TelegramApprovalConfig {
  enabled: boolean;
  // When unset, falls back to telegram.defaultChatId.
  chatId?: string;
}
