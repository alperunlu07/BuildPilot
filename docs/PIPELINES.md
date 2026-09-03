# Authoring pipelines

A pipeline is a directed acyclic graph (DAG) of step nodes connected by
conditional edges. BuildPilot ships the graph editor as a React Flow
canvas in the dashboard, but the pipeline itself is just JSON in SQLite,
so any client that speaks HTTP can build one. This document is the
authoring reference: model, semantics, every step type with its fields,
plus end-to-end recipes.

For the JSON-over-HTTP surface used to create / patch pipelines, see
[API.md → Pipelines](API.md#pipelines).

---

## Table of contents

- [The DAG model](#the-dag-model)
- [Watch, autoTrigger, and the poller](#watch-autotrigger-and-the-poller)
- [Step data, AI auto-fix, continueOnError](#step-data-ai-auto-fix-continueonerror)
- [Saved hosts and the "remote-or-local" pattern](#saved-hosts-and-the-remote-or-local-pattern)
- [Secret encryption](#secret-encryption)
- [Node templates](#node-templates)
- [Step catalog](#step-catalog)
  - [Git](#git)
  - [Build](#build)
  - [Notifications](#notifications)
  - [Artifacts & Upload](#artifacts--upload)
  - [Remote](#remote)
  - [iOS — Build](#ios--build)
  - [iOS — Signing](#ios--signing)
  - [iOS — Distribute & ASC](#ios--distribute--asc)
  - [iOS — Test (simctl)](#ios--test-simctl)
  - [iOS — Verify & Analyze](#ios--verify--analyze)
  - [iOS — Versioning & Plist](#ios--versioning--plist)
  - [iOS — Quality](#ios--quality)
  - [iOS — Screenshots](#ios--screenshots)
  - [Android](#android)
  - [Steam](#steam)
- [Recipes](#recipes)
  - [Unity Linux dedicated server](#unity-linux-dedicated-server)
  - [iOS → TestFlight (remote Mac over SSH)](#ios--testflight-remote-mac-over-ssh)
  - [Android APK + smoke-test on a connected device](#android-apk--smoke-test-on-a-connected-device)
  - [Steam Windows build upload](#steam-windows-build-upload)
  - [Notify-on-break (Slack + Telegram)](#notify-on-break-slack--telegram)

---

## The DAG model

Every pipeline has four top-level fields:

```jsonc
{
  "id": "<uuid>",
  "projectId": "<project-uuid>",
  "name": "Linux dedicated server",
  "watch": { ... },
  "nodes": [ ... ],
  "edges": [ ... ]
}
```

### Nodes

```ts
{
  id: string,                       // unique within this pipeline
  type: StepType,                   // one of 83 step types
  position: { x: number, y: number }, // canvas position; ignored at runtime
  data: Record<string, unknown>     // step-type-specific config
}
```

### Edges

```ts
{
  id: string,
  source: string,                   // upstream nodeId
  target: string,                   // downstream nodeId
  condition?: 'success' | 'failure' | 'always'   // defaults to 'always'
}
```

### Execution model

1. The engine performs a topological sort and identifies all **root
   nodes** (no incoming edges).
2. Each root starts in parallel, up to a per-pipeline concurrency limit.
3. When a node finishes, the engine inspects each outgoing edge and
   traverses it if the edge's `condition` matches the node's outcome:
   - `success` — traverse when the step succeeded
   - `failure` — traverse when the step failed
   - `always` — traverse regardless (use for cleanup / notify nodes)
4. A downstream node fires once **all** its predecessor edges have
   either fired or been definitively skipped — the same join semantics
   as GitHub Actions `needs:` or GitLab `needs:`.

This means a single graph can express:

- **Sequential pipelines:** linear chain of `success` edges.
- **Fan-out:** one node feeds many downstreams that run in parallel.
- **Fan-in:** a node that waits for multiple upstreams (e.g. parallel
  test suites converging on a single deploy step).
- **Notify-on-break:** a `failure` edge from `xcodebuild` to a
  `slackNotify` node.
- **Always-cleanup:** an `always` edge from a build step to a
  `keychainUnlock` (re-lock keychain) node.

### Restart from a node

`POST /api/builds { pipelineId, fromNodeId }` skips everything before
`fromNodeId` (BFS over outgoing edges). The dashboard's "Retry from
failed step" button uses this — handy when an early step is slow and
later ones are flaky.

---

## Watch, autoTrigger, and the poller

```ts
watch: {
  branch: string,                   // e.g. "main", "origin/develop"
  intervalSec: number,              // poll cadence in seconds
  autoTrigger: 'off' | 'ask' | 'pull' | 'pullAndBuild',
  telegramApprovals?: boolean
}
```

On every tick the poller does a `git fetch` and compares the remote
head against `pipeline.lastBuiltSha`. If the watched branch has
advanced, the action depends on `autoTrigger`:

| Value | Behaviour |
| --- | --- |
| `off` | No automatic action. Dashboard still shows a "new commits" toast and the `newCommit` SSE event still fires. Manual `POST /api/builds` works. |
| `ask` (default) | Shows the toast with **Pull** / **Pull & Build** buttons; nothing runs until you click. |
| `pull` | Auto-`git pull` on the watched branch. No build. |
| `pullAndBuild` | Auto-`git pull` then `POST /api/builds`. The full hands-off mode. |

### Telegram approvals

If `telegramApprovals: true` *and* the bot is configured (see
[TELEGRAM.md](TELEGRAM.md)), every new-commit event also sends an
inline message with **✅ Build** / **⏭ Skip** buttons. The chat is
`telegram.defaultChatId` from `~/.buildpilot/config.json`.

Combining `autoTrigger: 'ask'` with `telegramApprovals: true` gives
you a remote approval flow — you can kick off a build from your phone
while the dashboard sits on a monitor at your desk.

### The branch you watch ≠ the branch you build

The watched branch is independent of what the pipeline actually checks
out. A common pattern:

```
watch:    "development"
checkout: branch "ios-release"
gitMerge: source "development"
```

i.e. "whenever `development` advances, merge it into `ios-release` and
ship that". The `checkout` and `gitMerge` steps are normal nodes in
the DAG — the `watch` config only controls *when* the pipeline fires.

---

## Step data, AI auto-fix, continueOnError

### Step data

Every node carries a `data: Record<string, unknown>` object. The shape
is specific to the step type — the authoritative definitions live in
[`packages/shared-types/src/index.ts`](../packages/shared-types/src/index.ts)
(search for `*StepData`). Each step has a TypeScript interface that
declares required vs optional fields.

> **Boolean-looking strings.** Some fields are typed as `string` with
> `'true'` / `'false'` values rather than booleans — that's because the
> dashboard's form widgets use `<select>` elements. The engine
> normalises both forms.

### AI auto-fix

Any node's `data` can include an `aiAutoFix` block:

```ts
aiAutoFix?: {
  enabled: boolean,
  tool: 'claude' | 'codex' | 'aider' | 'gemini' | 'custom',
  prompt: string,                   // template — {{step}}, {{error}}, {{nodeId}}
  maxRetries: number
}
```

When the step fails:

1. The engine invokes the chosen AI tool with the templated prompt.
2. After the tool exits, the step is retried.
3. Loop up to `maxRetries` times.
4. If retries exhaust, the step is marked failed and edges with
   `failure`/`always` conditions fire as usual.

Useful for self-healing flake fixes (`shell` step in a CI script),
conflict resolution after `gitMerge`, and "try the obvious thing"
recovery on `xcodebuild` warnings-as-errors.

### continueOnError

```ts
data: { ..., continueOnError: 'true' }
```

When set, the step is allowed to fail without making the build go red:

- The step itself is logged at the `failure` level.
- Outgoing edges with condition `success` are **not** traversed.
- Outgoing edges with condition `failure` or `always` **are**
  traversed.
- The build's terminal status stays `success` (assuming nothing else
  fails).

Use this for non-critical "best effort" steps like uploading dSYMs or
posting a Slack notification — you don't want a hiccup there to mark a
clean build as failed.

---

## Saved hosts and the "remote-or-local" pattern

Steps that *can* run on a remote machine — `remoteSsh`, `sftpUpload`,
and every Mac-only step (`xcodebuild`, `keychainUnlock`, `notarize`,
`testflightUpload`, all the `simctl*` variants, …) — share a common
field group via the `RunsOnMaybeRemote` mixin:

```ts
hostId?: string                    // pick an entry from ~/.buildpilot/hosts.json
host?: string                      // user@host[:port]
identityFile?: string              // path to private key
password?: string                  // encrypted at rest
skipStrictHostKey?: string         // 'true' = -o StrictHostKeyChecking=no
```

Resolution order:

1. **`hostId` set** → use the saved host's credentials. The inline
   `host`/`identityFile`/`password` fields below are ignored.
2. **`hostId` blank, `host` set** → use the inline credentials.
3. **Both blank** → run **locally** with `child_process` (only valid
   when BuildPilot is itself on macOS, for Mac-only steps).

Saved hosts are managed in **Sidebar → SSH Hosts** in the dashboard,
or via the `/api/hosts` endpoints (see
[API.md → Saved SSH hosts](API.md#saved-ssh-hosts)). The host list
also surfaces a capability badge (Xcode version, macOS version,
arch) populated by `POST /api/hosts/:id/ping`.

---

## Secret encryption

Sensitive fields in step data are encrypted with AES-256-GCM before
being written to SQLite, using a master key in
`~/.buildpilot/master.key`. The field-name allow-list is in
[`apps/server/src/crypto/secrets.ts`](../apps/server/src/crypto/secrets.ts)
and currently covers:

```
botToken, password, accessKeyId, secretAccessKey, apiKeyId,
apiIssuerId, appPassword, keychainPassword, sentryAuthToken,
bugsnagApiKey, webhookUrl, smtpPassword, steamPassword,
steamWebApiKey, steamGuardCode, ascPrivateKey, ascApiKey,
apiKeyContents, filePassword, firebaseToken
```

Encryption is transparent — you `POST` plaintext values and the API
returns plaintext too. The dashboard never displays a saved secret
once it's stored; you have to retype to change it.

For full security details (master-key location, threat model,
on-disk format), see [README.md → Security](../README.md#security).

---

## Node templates

If you find yourself filling in the same Slack webhook + channel +
themed message across pipelines, save the configured node as a template:

1. Click the node, then **Save as template** in the property panel.
2. Drag the template from the palette into any pipeline — fields come
   pre-filled.
3. Manage templates via `/api/node-templates` (see
   [API.md → Node templates](API.md#node-templates)).

Templates store data the same way as nodes (sensitive fields
encrypted), so a template with a real webhook URL stays safe at rest.

---

## Step catalog

Each step lists its `type` id and the most commonly used `data` fields.
**For the full field list** including UI labels and help text, see
[`packages/step-registry/src/index.ts`](../packages/step-registry/src/index.ts);
for the TypeScript interfaces, see
[`packages/shared-types/src/index.ts`](../packages/shared-types/src/index.ts).

### Git

#### `checkout`
`git checkout <branch>` in the project's working tree. Required field:
`branch` (text or `branchSelect`).

#### `pull`
`git pull <remote>` on the current branch. Optional `remote` (defaults
to `origin`).

#### `gitMerge`
Merge another branch into HEAD. Fields:
- `sourceBranch` — local (`development`) or remote (`origin/development`).
- `noFastForward?` — `'true'` to force a merge commit.
- `message?` — override the merge commit message.

Pair with `aiAutoFix` on conflict for auto-resolution.

#### `ensureGitStatusClean`
Fails the pipeline if the working tree has any uncommitted changes.
No fields. Use as the very first node when running production
deploys.

#### `changelogFromGitCommits`
Generates a markdown changelog from commits between two refs. Useful
upstream of `slackNotify` or `testflightSetWhatToTest`. Fields include
`fromRef`, `toRef`, `format`, and `outputVar` (for future step-input
interpolation).

### Build

#### `shell`
Runs an arbitrary shell command in the project directory.
- `command` (required) — full shell command, including pipes / redirects.
- `cwd?` — relative to the project root.

The command is forwarded via the platform shell (`cmd.exe` on Windows,
`/bin/sh` elsewhere), so quoting works the same as in a terminal.

#### `unityBatch`
`Unity -batchmode -nographics -quit -executeMethod <Method>` wrapper.
- `unityPath` (required) — absolute path to the Unity Editor binary.
- `buildTarget` (required) — `StandaloneLinux64`, `StandaloneWindows64`,
  `StandaloneOSX`, `iOS`, `Android`, `WebGL`.
- `executeMethod` (required) — fully qualified C# static method, e.g.
  `BuildScript.BuildDedicatedServer`.
- `extraArgs?`, `logPath?`.

#### `aiPrompt`
Runs a CLI AI tool with a prompt.
- `tool` — `claude` / `codex` / `aider` / `gemini` / `custom`.
- `command?` — used only when `tool === 'custom'`.
- `prompt` — the prompt body. Templates: `{{step}}`, `{{error}}`,
  `{{nodeId}}` (when invoked by `aiAutoFix`; manual `aiPrompt` nodes
  receive empty values).
- `cwd?`, `allowFailure?`.

### Notifications

#### `slackNotify`
- `webhookUrl` — incoming-webhook URL (encrypted at rest).
- `text` — message body.

#### `discordNotify`
Same shape as Slack: `webhookUrl`, `content`.

#### `telegramNotify`
- `botToken?` — falls back to `telegram.botToken` in
  `~/.buildpilot/config.json`.
- `chatId?` — falls back to `telegram.defaultChatId`.
- `text` (required).
- `parseMode?` — `HTML`, `MarkdownV2`, or `plain`.
- `silent?` — `'true'` for muted notifications.

#### `teamsNotify`
Microsoft Teams incoming webhook. Three modes:
- `format: 'simple'` — `{ "text": "..." }` (universal fallback).
- `format: 'messageCard'` — adds `title`, `themeColor`.
- `format: 'raw'` — `text` is forwarded verbatim (must be valid JSON
  — paste an Adaptive Card for Workflow webhooks).

#### `emailNotify`
SMTP via `nodemailer`. Fields: `smtpHost`, `smtpPort`, `smtpUser`,
`smtpPassword` (encrypted), `from`, `to`, `subject`, `text` / `html`.

#### `httpRequest`
Generic HTTP call.
- `method` — GET/POST/PUT/PATCH/DELETE.
- `url`.
- `headers?` — one per line, `Key: Value`.
- `body?`.
- `expectedStatus?` — comma-separated list (`"200,201,204"`); defaults
  to "any 2xx".

### Artifacts & Upload

#### `artifact`
Records built files into the build's artifact catalog. Field: `paths`
— one per line, each is a file, a directory (lists non-recursive), or
a directory with `/**` suffix (recursive walk). Subsequent pipelines
can download these via `GET /api/artifacts/:id/download`.

#### `s3Upload`
AWS S3 multipart upload.
- `accessKeyId`, `secretAccessKey` (both encrypted).
- `region`, `bucket`, `localPath`, `key`.
- `storageClass?` — `STANDARD` / `STANDARD_IA` / `REDUCED_REDUNDANCY`
  / `GLACIER` / `DEEP_ARCHIVE`.
- `makePresignedUrl?`, `presignedExpiresSec?`.
- `manifestKey?` + `manifestChannel?` + `manifestPlatform?` — when
  set, also uploads a JSON manifest with `{channel, platform, version,
  url, sha256, size, archive_format, released_at}` (handy for game
  launchers that read a stable JSON URL).

#### `sftpUpload`
Single-file SFTP put.
- `RunsOnMaybeRemote` host fields.
- `localPath`, `remotePath`.

#### `dsymUpload`
Uploads iOS dSYM bundles to a crash reporter (Sentry, Bugsnag, …).
Auth fields are encrypted.

### Remote

#### `remoteSsh`
Runs a shell command on a saved or inline SSH host.
- `RunsOnMaybeRemote` host fields.
- `cwd?` — remote working dir (the command runs after `cd <cwd>`).
- `command` (required) — full remote shell command.

This is the workhorse step for any "drive a remote build server"
flow. For iOS builds, pair with `xcodebuild`-style commands; for
arbitrary remote builds (Linux server, Windows agent), just put
your build script in `command`.

### iOS — Build

`xcodebuild`, `xcodebuildAnalyze`, `buildAppGym`, `swiftPackageResolve`,
`cocoapodsInstall`, `xcodeSelect`, `bitcodeStrip` — all extend
`RunsOnMaybeRemote`.

#### `xcodebuild`
The core iOS / macOS compiler driver.
- `workspacePath?` **or** `projectPath?` (one is required for most actions).
- `scheme?` — required for build/archive/test/clean.
- `configuration?` — `Debug` / `Release`.
- `destination?` — e.g. `generic/platform=iOS`.
- `archivePath?` — output (archive) or input (exportArchive).
- `exportPath?`, `exportOptionsPlist?` — exportArchive only.
- `buildAction?` — `build` / `archive` / `test` / `clean` / `exportArchive`.
- `additionalArgs?`.

#### `buildAppGym`
`fastlane gym` — archive + export + xcpretty in one call. Compact
alternative to two separate `xcodebuild` invocations.

### iOS — Signing

`keychainUnlock`, `securityKeychainImport`, `provisioningProfileInstall`,
`sigh`, `fastlaneMatch`, `resign`, `codesignArbitrary`, `pushCertificate`,
`certManage`, `registerDevices`. All extend `RunsOnMaybeRemote`.

#### `keychainUnlock`
- `keychain?` — defaults to `login.keychain-db`.
- `password` (required, encrypted at rest).
- `unlockTimeoutSec?`.

Run before `xcodebuild` to keep codesigning from prompting in headless
sessions.

#### `provisioningProfileInstall`
- `profilePath` — path to the `.mobileprovision`. For remote installs
  the file is read from the BuildPilot host and SFTP'd onto the Mac
  before installation.

#### `fastlaneMatch`
`fastlane match` for certificate/profile syncing via a private git repo.
Fields cover repo URL, branch, type (development/appstore/adhoc),
encryption password (encrypted).

### iOS — Distribute & ASC

`testflightUpload`, `testflightSetWhatToTest`, `testflightPublicLink`,
`testflightManage`, `notarize`, `stapleNotarization`,
`branchTargetedTestFlight`, `distributionGroups`, `phasedRollout`,
`appStorePrecheck`, `appStoreCreate`, `appStoreUpload`,
`appStoreConnectApi`, `otaManifestGenerate`, `firebaseAppDistribution`.

#### `testflightUpload`
- `RunsOnMaybeRemote` host fields.
- `ipaPath` — local-to-Mac path.
- `authMethod` — `apiKey` (recommended) or `appleId`.
- For `apiKey`: `apiKeyId` + `apiIssuerId` (the `.p8` lives at
  `~/.appstoreconnect/private_keys/` on the Mac).
- For `appleId`: `appleId` + `appPassword` (an app-specific password,
  encrypted).
- `platform?` — `ios` / `macos` / `tvos`.

#### `appStoreConnectApi`
Generic raw-API step over the App Store Connect REST API. Uses
ES256 JWT signing internally — fill in `apiKeyId`, `apiIssuerId`,
`ascPrivateKey` (the `.p8` contents, encrypted), then `method`,
`path`, `queryJson`, `bodyJson`. The response body is logged and the
step succeeds on any 2xx.

#### `notarize`
`xcrun notarytool submit`. Two auth methods (apiKey / appleId), bundle
path, and an optional `wait` flag — `'true'` (default) blocks for the
verdict, `'false'` returns once Apple accepts the upload.

#### `stapleNotarization`
`xcrun stapler staple` — embeds the notarization ticket into the
bundle. Run after a `wait: 'false'` notarize step.

#### `firebaseAppDistribution`
Distributes an IPA / APK / AAB to a Firebase App Distribution group.
Fields: `firebaseToken` (encrypted), `appId`, `binaryPath`, optional
`testers` / `groups` / `releaseNotes`.

### iOS — Test (simctl)

`simctlPrepare`, `simctlInstallLaunch`, `simctlScreenshot`,
`simctlPushNotification`, `simctlStatusBarOverride`,
`simctlPrivacyGrant`, `storekitConfigure`.

All wrap `xcrun simctl` operations for iOS Simulator automation —
boot a runtime, install your app, drive a deep link, override the
status bar for clean screenshots, grant privacy permissions
non-interactively, configure StoreKit testing.

### iOS — Verify & Analyze

`dsymVerify`, `privacyManifestValidate`, `privacyManifestAggregate`,
`appThinningReportParse`, `linkMapAnalyze`.

Static-analysis helpers that turn pass/fail signals from Apple's
tooling into BuildPilot success/failure outcomes.

### iOS — Versioning & Plist

#### `incrementBuildNumber` / `getBuildNumber`
Bumps or reads `CFBundleVersion` from a target Info.plist.

#### `updateInfoPlist`
Sets one or more keys in an Info.plist. Fields: `plistPath`,
`updates` (multiline `Key=Value`).

#### `xcresultParse`
Parses an `.xcresult` bundle and surfaces test counts /
failures / coverage as build log entries.

### iOS — Quality

`swiftlint`, `swiftFormat`, `peripheryScan`, `slatherCoverage`,
`xcovGate`.

Standard Swift toolchain hooks. `xcovGate` fails the pipeline below a
coverage threshold; pair with `slatherCoverage` upstream.

### iOS — Screenshots

`snapshot`, `frameit` — `fastlane snapshot` for automated screenshot
generation across device sizes, then `fastlane frameit` to wrap them
in marketing device frames.

### Android

#### `gradleBuild`
- `output` — `apk` (assembles), `aab` (bundles), or `custom` (runs
  `gradleTask`).
- `variant?` — default `Release`. Case-sensitive (gradle generates
  `assembleRelease`, not `assemblerelease`).
- `module?` — default `:app`.
- `gradleTask?` — used when `output === 'custom'`, e.g.
  `:app:assembleStagingDebug`.
- `gradleArgs?` — extra flags after the task.
- `cwd?` — relative to project root (where `gradlew` lives).
- `registerArtifact?` — `'true'` (default) auto-registers the produced
  APK/AAB into the build's artifact catalog.

#### `adbConnect` / `adbPair` / `adbInstall` / `adbShellLaunch` / `adbLogcat`
Smoke-test cluster — pair a Wi-Fi device with `adbConnect`, push the
APK with `adbInstall`, launch the activity with `adbShellLaunch`, then
capture N seconds of `adbLogcat` as an artifact.

#### `androidSign` / `bundletool`
`androidSign` signs an **APK** (`apksigner`, falling back to
`jarsigner`) with a keystore. `bundletool` turns an `.aab` into a
`.apks` set (`build-apks`) or installs one on a device
(`install-apks`) — useful for testing a bundle locally before it goes
to Play. Neither is needed for a Play upload: Play takes a signed
`.aab` straight from the build.

#### Google Play setup (one-time)

Both Play steps authenticate as a **service account**, not as you:

1. Google Cloud Console → the project linked to your Play developer
   account → *IAM & Admin → Service Accounts* → create one, then
   *Keys → Add key → JSON*. Download it.
2. Play Console → *Setup → API access* → link the Cloud project, find
   the service account, *Grant access*, give it **Release manager** on
   the app (Admin works too, but is broader than needed).
3. Put the `.json` somewhere the server can read — `~/.buildpilot/`
   keeps it next to the other runtime state. Point
   `serviceAccountJsonPath` at it, or paste the contents into
   `playServiceAccountJson`, which is encrypted at rest.

Permission changes can take a few minutes to propagate; a fresh grant
that 403s is usually just early.

#### `playConsoleUpload`
Uploads an `.aab` (preferred) or `.apk` and releases it on a track.

- `packageName` — the `applicationId`, e.g. `com.example.app`.
- `binaryPath` — relative to the project root, or absolute.
- `track` — `internal` (default) | `alpha` | `beta` | `production`.
- `status` — `completed` (default, fully rolled out) | `inProgress`
  (staged; requires `userFraction` in `(0, 1]`) | `halted` | `draft`
  (uploaded but served to nobody — publish it from the Console).
- `releaseNotes` — `[lang]` blocks for multi-line notes, or the short
  `lang=text` form. 500 characters per locale.

Two failures worth knowing before they cost you a build:

- **"Version code N has already been used"** — Play requires a unique,
  never-reused version code per upload. Bump it in the build itself
  (Unity: `PlayerSettings.Android.bundleVersionCode++`; Gradle:
  `versionCode` in `build.gradle`) rather than by hand, or every
  unattended run fails here.
- **An `.aab` that is really an APK** — Unity emits an APK unless
  `EditorUserBuildSettings.buildAppBundle` is `true`, whatever the
  output file is named. The step checks for `BundleConfig.pb` and
  refuses locally, because Play only reports this as a bare HTTP 500
  *after* the whole binary has been uploaded.

#### `playConsolePromote`
Releases a version code Play **already has** onto a track, with no
re-upload — publishing a draft, moving internal → beta → production,
or halting a rollout. `playConsoleUpload` cannot do this: it always
uploads first, and re-uploading an existing version code is rejected.

- `versionCode` — must already exist in the app. The step lists the
  app's bundles/APKs first and fails with the known codes if it
  doesn't, rather than letting `:commit` fail opaquely.
- `track` — required, no default. Promoting chooses the audience, so
  guessing it is not safe.
- `status`, `userFraction`, `releaseName`, `releaseNotes` — as above.

Updating a track replaces its release list, so a promote supersedes
whatever that track was serving.

### Steam

#### `steamcmdSetup`
Downloads and extracts `steamcmd` on the build host (local or remote).
Optionally drops a sentry/ssfn file pair to bypass Steam Guard on
subsequent runs.

#### `steamUpload`
Runs `steamcmd +login +run_app_build`. Provide either an existing
`vdfPath` or the inputs (`appId`, `contentRoot`, `depots`) for
on-the-fly VDF generation. `setLive` promotes the build to a branch
in one shot.

#### `steamSetLive`
Calls the Steam Web API `SetAppBuildLive` endpoint — useful when
you want to upload via `steamUpload` and promote later (e.g. after
a soak test).

#### `steamWorkshopUpload`
Uploads / updates a Workshop item. `itemId: "0"` creates a new item.

---

## Recipes

End-to-end pipelines you can paste into `POST /api/pipelines` and
tweak.

### Unity Linux dedicated server

```bash
curl -X POST http://127.0.0.1:51731/api/pipelines \
  -H 'content-type: application/json' \
  -d '{
    "projectId": "<project-id>",
    "name": "Linux dedicated server",
    "watch": { "branch": "development", "intervalSec": 60, "autoTrigger": "ask" },
    "nodes": [
      { "id":"n1", "type":"checkout",   "position":{"x":0,"y":0},   "data":{"branch":"development"} },
      { "id":"n2", "type":"pull",       "position":{"x":240,"y":0}, "data":{"remote":"origin"} },
      { "id":"n3", "type":"unityBatch", "position":{"x":480,"y":0},
        "data": {
          "unityPath":"C:/Program Files/Unity/Hub/Editor/2022.3.40f1/Editor/Unity.exe",
          "buildTarget":"StandaloneLinux64",
          "executeMethod":"BuildScript.BuildDedicatedServer"
        } },
      { "id":"n4", "type":"artifact",   "position":{"x":720,"y":0}, "data":{"paths":"Builds/Linux/**"} },
      { "id":"n5", "type":"slackNotify","position":{"x":960,"y":0},
        "data":{"webhookUrl":"https://hooks.slack.com/...","text":":white_check_mark: dedicated server built"} }
    ],
    "edges": [
      { "id":"e1","source":"n1","target":"n2","condition":"success" },
      { "id":"e2","source":"n2","target":"n3","condition":"success" },
      { "id":"e3","source":"n3","target":"n4","condition":"success" },
      { "id":"e4","source":"n4","target":"n5","condition":"success" }
    ]
  }'
```

### iOS → TestFlight (remote Mac over SSH)

Assumes you've registered a Mac as a saved host (id below shown as
`<host-id>`):

```jsonc
{
  "projectId": "<project-id>",
  "name": "iOS → TestFlight",
  "watch": { "branch": "main", "intervalSec": 120, "autoTrigger": "ask", "telegramApprovals": true },
  "nodes": [
    { "id":"n1", "type":"checkout",                  "position":{"x":0,"y":0},     "data":{"branch":"main"} },
    { "id":"n2", "type":"pull",                      "position":{"x":220,"y":0},   "data":{"remote":"origin"} },
    { "id":"n3", "type":"keychainUnlock",            "position":{"x":440,"y":0},
      "data":{ "hostId":"<host-id>", "password":"<keychain-password>" } },
    { "id":"n4", "type":"provisioningProfileInstall","position":{"x":660,"y":0},
      "data":{ "hostId":"<host-id>", "profilePath":"build/MyApp.mobileprovision" } },
    { "id":"n5", "type":"xcodebuild",                "position":{"x":880,"y":0},
      "data":{
        "hostId":"<host-id>",
        "workspacePath":"MyApp.xcworkspace",
        "scheme":"MyApp",
        "configuration":"Release",
        "destination":"generic/platform=iOS",
        "buildAction":"archive",
        "archivePath":"build/MyApp.xcarchive"
      } },
    { "id":"n6", "type":"xcodebuild",                "position":{"x":1100,"y":0},
      "data":{
        "hostId":"<host-id>",
        "buildAction":"exportArchive",
        "archivePath":"build/MyApp.xcarchive",
        "exportPath":"build/export",
        "exportOptionsPlist":"build/ExportOptions.plist"
      } },
    { "id":"n7", "type":"artifact",                  "position":{"x":1320,"y":0}, "data":{"paths":"build/export/**"} },
    { "id":"n8", "type":"testflightUpload",          "position":{"x":1540,"y":0},
      "data":{
        "hostId":"<host-id>",
        "ipaPath":"build/export/MyApp.ipa",
        "authMethod":"apiKey",
        "apiKeyId":"<ASC API key id>",
        "apiIssuerId":"<ASC issuer id>"
      } },
    { "id":"err","type":"telegramNotify",            "position":{"x":880,"y":200},
      "data":{ "text":"❌ iOS build failed at <pipeline name>" } }
  ],
  "edges": [
    { "id":"e1","source":"n1","target":"n2","condition":"success" },
    { "id":"e2","source":"n2","target":"n3","condition":"success" },
    { "id":"e3","source":"n3","target":"n4","condition":"success" },
    { "id":"e4","source":"n4","target":"n5","condition":"success" },
    { "id":"e5","source":"n5","target":"n6","condition":"success" },
    { "id":"e6","source":"n6","target":"n7","condition":"success" },
    { "id":"e7","source":"n7","target":"n8","condition":"success" },
    { "id":"e8","source":"n5","target":"err","condition":"failure" }
  ]
}
```

Notes:
- `n5 → err` is a `failure` edge — if `xcodebuild archive` fails,
  the Telegram notify fires instead of continuing down the chain.
- The `.p8` API key file must live at
  `~/.appstoreconnect/private_keys/AuthKey_<apiKeyId>.p8` on the Mac.
- Replace `<keychain-password>` with the Mac user's keychain password
  (stored encrypted in BuildPilot's DB).

### Android APK + smoke-test on a connected device

```jsonc
{
  "projectId": "<project-id>",
  "name": "Android smoke test",
  "watch": { "branch": "main", "intervalSec": 60, "autoTrigger": "pullAndBuild" },
  "nodes": [
    { "id":"n1", "type":"checkout",        "position":{"x":0,"y":0},     "data":{"branch":"main"} },
    { "id":"n2", "type":"pull",            "position":{"x":220,"y":0},   "data":{"remote":"origin"} },
    { "id":"n3", "type":"gradleBuild",     "position":{"x":440,"y":0},
      "data":{ "output":"apk", "variant":"Debug", "module":":app" } },
    { "id":"n4", "type":"adbConnect",      "position":{"x":660,"y":0},
      "data":{ "address":"192.168.1.50:5555" } },
    { "id":"n5", "type":"adbInstall",      "position":{"x":880,"y":0},
      "data":{ "apkPath":"app/build/outputs/apk/debug/app-debug.apk" } },
    { "id":"n6", "type":"adbShellLaunch",  "position":{"x":1100,"y":0},
      "data":{ "packageName":"com.example.app", "activity":".MainActivity", "waitForLaunch":"true" } },
    { "id":"n7", "type":"adbLogcat",       "position":{"x":1320,"y":0}, "data":{ "durationSec":30 } }
  ],
  "edges": [
    { "id":"e1","source":"n1","target":"n2","condition":"success" },
    { "id":"e2","source":"n2","target":"n3","condition":"success" },
    { "id":"e3","source":"n3","target":"n4","condition":"success" },
    { "id":"e4","source":"n4","target":"n5","condition":"success" },
    { "id":"e5","source":"n5","target":"n6","condition":"success" },
    { "id":"e6","source":"n6","target":"n7","condition":"always" }
  ]
}
```

The `n6 → n7` edge is `always` so logcat captures even if the launch
fails — useful for diagnosing crash-on-start.

### Steam Windows build upload

```jsonc
{
  "projectId": "<project-id>",
  "name": "Steam Windows upload",
  "watch": { "branch": "release", "intervalSec": 300, "autoTrigger": "ask" },
  "nodes": [
    { "id":"n1", "type":"checkout",      "position":{"x":0,"y":0},   "data":{"branch":"release"} },
    { "id":"n2", "type":"unityBatch",    "position":{"x":220,"y":0},
      "data":{
        "unityPath":"C:/Program Files/Unity/Hub/Editor/2022.3.40f1/Editor/Unity.exe",
        "buildTarget":"StandaloneWindows64",
        "executeMethod":"BuildScript.BuildWindows"
      } },
    { "id":"n3", "type":"steamcmdSetup", "position":{"x":440,"y":0},
      "data":{ "installDir":"C:/buildpilot/steamcmd", "platform":"windows" } },
    { "id":"n4", "type":"steamUpload",   "position":{"x":660,"y":0},
      "data":{
        "username":"<steam-builder-account>",
        "password":"<steam-password>",
        "appId":"480",
        "contentRoot":"Builds/Windows",
        "buildOutput":"Builds/Output",
        "depots":"481:Builds/Windows::true",
        "setLive":"beta"
      } }
  ],
  "edges": [
    { "id":"e1","source":"n1","target":"n2","condition":"success" },
    { "id":"e2","source":"n2","target":"n3","condition":"success" },
    { "id":"e3","source":"n3","target":"n4","condition":"success" }
  ]
}
```

`steamPassword` is encrypted at rest. Configure 2FA bypass with
`sentryFileBase64` / `ssfnFileBase64` on the `steamcmdSetup` step.

### Notify-on-break (Slack + Telegram)

Wire failure edges from your build steps into a notify cluster so a
broken main branch immediately pings the team:

```jsonc
{
  "nodes": [
    { "id":"build", "type":"unityBatch", "position":{"x":0,"y":0},   "data":{ /* ... */ } },
    { "id":"slk",   "type":"slackNotify","position":{"x":300,"y":160},
      "data":{ "webhookUrl":"https://hooks.slack.com/...","text":":x: build broke on `${TRIGGER_BRANCH}`" } },
    { "id":"tg",    "type":"telegramNotify","position":{"x":600,"y":160},
      "data":{ "text":"❌ Build failed — check the dashboard." } }
  ],
  "edges": [
    { "id":"e1","source":"build","target":"slk","condition":"failure" },
    { "id":"e2","source":"slk","target":"tg","condition":"always" }
  ]
}
```

`slk → tg` uses `always` so the Telegram still fires even if the
Slack webhook is the thing that broke.
