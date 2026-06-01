# BuildPilot

Local CI/CD with a web dashboard, a React Flow pipeline editor, and a
cross-platform build engine that can drive Windows, Linux, macOS, iOS,
Android and Steam builds from a single host (often by orchestrating a
remote Mac over SSH).

A background daemon polls the git repos you register, surfaces an in-page
toast (and optionally a Telegram approval prompt) when a watched branch
gets new commits, and runs build pipelines you compose visually. The UI is
a local web app — open it in any browser on the same machine, or on the
LAN if you bind the server to `0.0.0.0`.

> **Heads up:** there is no authentication. Keep BuildPilot on
> `127.0.0.1` or behind a trusted network / Tailscale until LAN auth lands
> (Phase 2.6.B). All step credentials are encrypted at rest with
> AES-256-GCM (see [Security](#security) below).

## Status

Roughly **66% feature-complete** against the living roadmap in
[`TODO.md`](TODO.md): 130 of 197 items merged.

Working today:

- ✅ Full cross-OS pipeline engine — 83 step types organised into 14
  palette categories
- ✅ iOS / TestFlight / App Store Connect API end-to-end (via local Mac
  or remote Mac over SSH)
- ✅ Android build/install/logcat cluster
- ✅ Steam (steamcmd) upload, branch-promote and Workshop upload
- ✅ Notifications: Slack, Discord, Telegram, Microsoft Teams, SMTP email
- ✅ Webhook triggers: GitHub, GitLab, Gitea + a generic API trigger
- ✅ Telegram bot — interactive `/build`, `/list`, `/help` plus
  approval-on-new-commit prompts
- ✅ Encrypted secrets at rest (AES-256-GCM with a per-install master key)
- ✅ AI auto-fix on step failure (claude / codex / aider / gemini / custom)
- ✅ Saved SSH hosts with capability probing (Xcode / macOS / arch)
- ✅ Server-Sent Events live dashboard
- ✅ Reusable node templates
- ✅ Per-step `continueOnError`, conditional edges, partial-graph re-runs

Open work tracked in [`TODO.md`](TODO.md) — biggest gaps are LAN auth,
build matrix expansion, manual approval steps, file-vault credentials,
and a few Android polish items.

## Stack

- **Server:** Node.js 20+ · Fastify · SQLite (`better-sqlite3`) ·
  `simple-git` · ssh2 · pino (TypeScript)
- **Web:** React 18 · Vite · Tailwind · React Flow (`@xyflow/react`) ·
  Zustand
- **Monorepo:** pnpm workspaces

## Layout

```
apps/
  server/           Fastify daemon: REST + SSE + git poller + pipeline engine
                    + telegram bot + webhook receivers
  web/              React dashboard: project list, commit view,
                    React Flow editor, settings page
packages/
  shared-types/     TypeScript interfaces shared by server + web
  step-registry/    Pipeline node UI definitions + field schemas (83 types)
docs/
  API.md            Full HTTP + SSE reference
  PIPELINES.md      Pipeline DAG model + step catalog + recipes
  WEBHOOKS.md       GitHub / GitLab / Gitea / generic-API trigger guide
  TELEGRAM.md       Bot setup + commands + approval flow
TODO.md             Living roadmap with commit-linked progress
```

## Getting started

Requires **Node 20+** and **pnpm 10+**.

```bash
pnpm install
pnpm dev
```

This starts:

- **Server** on `http://127.0.0.1:51731` (REST + SSE)
- **Web** on `http://127.0.0.1:51732` (Vite dev server, opens
  automatically in your default browser)

Both ports sit in the IANA dynamic range (49152–65535) and avoid the
Windows Hyper-V reserved blocks (49823–49922, 50000–50059, …). If you
ran an older build that used `7777/5173` or `49831/49832`, BuildPilot
auto-migrates the config on startup.

The web app proxies `/api/*` and `/events` to the server, so you can
treat the Vite URL as the single entry point.

### Desktop tray app (background + auto-start)

`apps/desktop` packages BuildPilot as an Electron **system-tray app**: it
starts the server in the background, auto-launches at login (hidden into the
tray), shows native OS notifications for pipeline events, and opens the
dashboard from a left-click. Right-click for per-project shortcuts (open
folder, `git pull`/`fetch`, jump into the panel).

```bash
pnpm desktop:dev      # build the web bundle + launch Electron locally
pnpm desktop:dist     # build a platform installer (.exe / .dmg / AppImage)
```

See **[docs/DESKTOP.md](docs/DESKTOP.md)** for the architecture and the
Windows installer / native-rebuild steps.

### Adding a project

Click the **+** button in the sidebar, paste an absolute path to a git
repo, and confirm. BuildPilot auto-detects the default branch
(`main`/`master`), lists local + remote branches, and shows commit
history with collapsible bodies.

You can also do this with `curl`:

```bash
curl -X POST http://127.0.0.1:51731/api/projects \
  -H 'content-type: application/json' \
  -d '{"path": "C:/work/my-game"}'
```

### Creating a pipeline

Open a project, click **New pipeline**. The starter graph is
`checkout → pull → unityBatch` — fill in the Unity executable path
and build method, then **Run**. Drag more nodes from the left palette
to extend the graph; click any node to edit its properties on the right.

Want to script it instead? See [docs/API.md → Pipelines](docs/API.md#pipelines)
for a `POST /api/pipelines` example that creates the same graph in one
call, and [docs/PIPELINES.md](docs/PIPELINES.md) for the full DAG model.

### Watching a branch

Each pipeline has a `watch` configuration:

```jsonc
{
  "branch": "development",
  "intervalSec": 60,
  "autoTrigger": "ask",     // off | ask | pull | pullAndBuild
  "telegramApprovals": true // optional — Telegram approval buttons
}
```

The poller fetches the remote on that cadence. When the watched branch
advances, BuildPilot:

- `off` — does nothing (the toast still appears in the dashboard)
- `ask` — shows a toast in the dashboard with **Pull** / **Pull & Build**
  buttons (default)
- `pull` — auto-pulls the watched branch
- `pullAndBuild` — auto-pulls and immediately queues a build

If `telegramApprovals: true` and you've configured a bot (see
[Settings → Telegram](#settings--telegram)), an inline Telegram message
with **✅ Build** / **⏭ Skip** buttons is sent on every new commit.

> The watched branch is independent of the branch the pipeline builds —
> e.g., watch `development`, then have the pipeline `checkout` to
> `ios-release` and merge.

### Triggering builds from CI / cron / webhooks

Every pipeline gets four trigger endpoints automatically:

```bash
# Generic API trigger (optional shared-secret token)
curl -X POST 'http://127.0.0.1:51731/api/triggers/<pipelineId>?token=<secret>' \
  -H 'content-type: application/json' \
  -d '{"triggerBranch":"main"}'

# GitHub / GitLab / Gitea webhook receivers (HMAC-verified)
POST /api/webhooks/github/<pipelineId>
POST /api/webhooks/gitlab/<pipelineId>
POST /api/webhooks/gitea/<pipelineId>
```

Per-pipeline webhook secrets are read from environment variables —
see [docs/WEBHOOKS.md](docs/WEBHOOKS.md) for the full setup and signature
verification details.

## Step types

83 step types organised into the categories below. The full reference
including each step's required/optional fields lives in
[docs/PIPELINES.md → Step catalog](docs/PIPELINES.md#step-catalog).

| Category | Steps |
| --- | --- |
| **Git** | `checkout`, `pull`, `gitMerge`, `ensureGitStatusClean`, `changelogFromGitCommits` |
| **Build** | `shell`, `unityBatch`, `aiPrompt` |
| **Notifications** | `slackNotify`, `discordNotify`, `telegramNotify`, `teamsNotify`, `emailNotify`, `httpRequest` |
| **Artifacts & Upload** | `artifact`, `s3Upload`, `sftpUpload`, `dsymUpload` |
| **Remote** | `remoteSsh` |
| **iOS — Build** | `xcodeSelect`, `xcodebuild`, `xcodebuildAnalyze`, `buildAppGym`, `swiftPackageResolve`, `cocoapodsInstall`, `bitcodeStrip` |
| **iOS — Signing** | `keychainUnlock`, `securityKeychainImport`, `provisioningProfileInstall`, `sigh`, `fastlaneMatch`, `resign`, `codesignArbitrary`, `pushCertificate`, `certManage`, `registerDevices` |
| **iOS — Distribute & ASC** | `notarize`, `stapleNotarization`, `testflightUpload`, `testflightSetWhatToTest`, `testflightPublicLink`, `testflightManage`, `branchTargetedTestFlight`, `distributionGroups`, `phasedRollout`, `appStorePrecheck`, `appStoreCreate`, `appStoreUpload`, `appStoreConnectApi`, `otaManifestGenerate`, `firebaseAppDistribution` |
| **iOS — Test (simctl)** | `simctlPrepare`, `simctlInstallLaunch`, `simctlScreenshot`, `simctlPushNotification`, `simctlStatusBarOverride`, `simctlPrivacyGrant`, `storekitConfigure` |
| **iOS — Verify & Analyze** | `dsymVerify`, `privacyManifestValidate`, `privacyManifestAggregate`, `appThinningReportParse`, `linkMapAnalyze` |
| **iOS — Versioning & Plist** | `incrementBuildNumber`, `getBuildNumber`, `updateInfoPlist`, `xcresultParse` |
| **iOS — Quality** | `swiftlint`, `swiftFormat`, `peripheryScan`, `slatherCoverage`, `xcovGate` |
| **iOS — Screenshots** | `snapshot`, `frameit` |
| **Android** | `gradleBuild`, `adbConnect`, `adbInstall`, `adbShellLaunch`, `adbLogcat` |
| **Steam** | `steamcmdSetup`, `steamUpload`, `steamSetLive`, `steamWorkshopUpload` |

Pipelines are DAGs. Edges carry a condition (`success`, `failure`,
`always`) so you can wire up notify-on-break flows and "always cleanup"
paths. Independent DAG branches run in parallel, capped by a
per-pipeline concurrency limit.

### AI auto-fix

Every step has an optional **AI Auto-Fix on failure** block. When
enabled, a step failure triggers the chosen AI tool (`claude` / `codex`
/ `aider` / `gemini` / custom CLI) with a templated prompt
(`{{step}}`, `{{error}}`, `{{nodeId}}`); after the AI exits, BuildPilot
retries the step. Loops up to `maxRetries` times before bailing. Useful
for self-healing flake fixes, conflict resolution after `gitMerge`, and
"try the obvious thing" recovery.

### iOS / Mac builds

BuildPilot drives a Mac builder over SSH from any host (Windows, Linux),
or runs Mac-only steps directly when installed on macOS. Every iOS step
that needs a Mac (`xcodebuild`, `keychainUnlock`, `testflightUpload`, …)
accepts a saved-host id; if you leave it blank, the step runs locally.

A typical TestFlight pipeline:

```
checkout → pull → keychainUnlock ──► provisioningProfileInstall ──►
        remoteSsh (xcodebuild archive + exportArchive) ──► artifact ──►
        testflightUpload
```

See [docs/PIPELINES.md → iOS recipe](docs/PIPELINES.md#ios--testflight-recipe)
for an end-to-end example with all field values.

## Settings → Telegram

Open **Settings** from the sidebar to configure the Telegram integration
from the dashboard. Fields:

- **Enabled** — toggle the bot polling loop
- **Bot token** — from `@BotFather`; stored encrypted, displayed as
  `••••<last4>` after save
- **Default chat ID** — numeric ID or `@channel`; encrypted at rest

Save restarts the polling loop in-process. The page also has a **Send
test message** button that hits `POST /api/config/telegram/test` so you
can verify reachability before relying on the bot in a pipeline.

Once configured, the bot responds to these commands in the configured
chat:

```
/start, /help    Show command help
/list            List configured pipelines
/build           Show a button menu of pipelines
/build <name>    Trigger pipeline whose name matches the substring
```

Pipelines with `watch.telegramApprovals: true` send an interactive
**✅ Build** / **⏭ Skip** message on every new commit instead of just
toasting in the dashboard.

Full setup including BotFather steps and chat-ID discovery lives in
[docs/TELEGRAM.md](docs/TELEGRAM.md).

## HTTP API

Everything the dashboard does is also exposed as plain JSON over HTTP,
so you can register projects, design pipelines, trigger builds, and
manage settings entirely from scripts. The dashboard listens on the SSE
feed and refreshes itself whenever something changes — anything you
create from `curl` shows up live without a reload.

Base URL: `http://127.0.0.1:51731`

Quick taste (creating a project + pipeline + triggering a build):

```bash
# 1. Register a local git repo
PROJECT=$(curl -s -X POST http://127.0.0.1:51731/api/projects \
  -H 'content-type: application/json' \
  -d '{"path":"C:/work/my-game"}' | jq -r .id)

# 2. Create a pipeline (Unity dedicated-server build)
PIPELINE=$(curl -s -X POST http://127.0.0.1:51731/api/pipelines \
  -H 'content-type: application/json' \
  -d "{
    \"projectId\":\"$PROJECT\",
    \"name\":\"Linux dedicated server\",
    \"watch\":{\"branch\":\"development\",\"intervalSec\":60,\"autoTrigger\":\"ask\"},
    \"nodes\":[
      {\"id\":\"n1\",\"type\":\"checkout\",\"position\":{\"x\":0,\"y\":0},\"data\":{\"branch\":\"development\"}},
      {\"id\":\"n2\",\"type\":\"pull\",\"position\":{\"x\":240,\"y\":0},\"data\":{\"remote\":\"origin\"}},
      {\"id\":\"n3\",\"type\":\"unityBatch\",\"position\":{\"x\":480,\"y\":0},
        \"data\":{
          \"unityPath\":\"C:/Program Files/Unity/Hub/Editor/2022.3.40f1/Editor/Unity.exe\",
          \"buildTarget\":\"StandaloneLinux64\",
          \"executeMethod\":\"BuildScript.BuildDedicatedServer\"
        }}
    ],
    \"edges\":[
      {\"id\":\"e1\",\"source\":\"n1\",\"target\":\"n2\",\"condition\":\"success\"},
      {\"id\":\"e2\",\"source\":\"n2\",\"target\":\"n3\",\"condition\":\"success\"}
    ]
  }" | jq -r .id)

# 3. Trigger a build
curl -X POST http://127.0.0.1:51731/api/builds \
  -H 'content-type: application/json' \
  -d "{\"pipelineId\":\"$PIPELINE\"}"

# 4. Watch logs live
curl -N http://127.0.0.1:51731/events
```

The complete reference — every endpoint with request/response shapes,
zod schemas, SSE event payloads, and `curl` examples — is in
[docs/API.md](docs/API.md).

### Endpoint groups

| Group | Base path | Doc section |
| --- | --- | --- |
| Projects | `/api/projects` | [docs/API.md#projects](docs/API.md#projects) |
| Pipelines | `/api/pipelines` | [docs/API.md#pipelines](docs/API.md#pipelines) |
| Builds | `/api/builds`, `/api/artifacts` | [docs/API.md#builds](docs/API.md#builds) |
| Node templates | `/api/node-templates` | [docs/API.md#node-templates](docs/API.md#node-templates) |
| Saved SSH hosts | `/api/hosts` | [docs/API.md#saved-ssh-hosts](docs/API.md#saved-ssh-hosts) |
| Webhook triggers | `/api/triggers`, `/api/webhooks` | [docs/API.md#triggers--webhooks](docs/API.md#triggers--webhooks) |
| Server config | `/api/config/telegram` | [docs/API.md#server-config](docs/API.md#server-config) |
| Live event stream | `/events` | [docs/API.md#sse-events](docs/API.md#sse-events) |

## Configuration

On first run a default config is written to `~/.buildpilot/config.json`:

```jsonc
{
  "host": "127.0.0.1",
  "port": 51731,
  "pollIntervalSec": 60,
  "dbPath": "~/.buildpilot/db.sqlite",
  "webOrigin": "http://127.0.0.1:51732",
  "telegram": {
    "enabled": false,
    "botToken": "",        // encrypted on disk after first save
    "defaultChatId": ""    // encrypted on disk after first save
  }
}
```

Set `host` to `0.0.0.0` to expose the dashboard on your LAN. By default
**authentication is disabled** so single-user installs Just Work. To turn
on LAN auth (Cluster 11.A):

1. Add an `auth: { enabled: true }` block to `~/.buildpilot/config.json`
   (or flip the existing one). On the next server start a random
   `sessionSecret` is generated and persisted encrypted-at-rest.
2. Restart the server, navigate to the dashboard, and create the first
   user via `POST /api/users` — this bootstrap call is allowed without
   authentication while the user table is empty, and the resulting user
   is forced to the `admin` role.
3. From then on, the dashboard redirects to `/login` for unauthenticated
   visitors and every request to the API enforces the session cookie or
   `Authorization: Bearer <token>` header. Long-lived tokens live at
   `/api-tokens`. The audit log at `/audit` records every state-mutating
   call regardless of whether auth is on (anonymous calls show up as
   `actor: anonymous`).

To go back to the open default, set `auth.enabled` back to `false` and
restart the server.

You don't need to edit this file by hand for normal use — the dashboard's
Settings page handles Telegram, and project / pipeline / host data lives
in the SQLite DB and `hosts.json`.

## Security

Every secret BuildPilot stores is encrypted at rest using AES-256-GCM
with a per-install master key:

- **Master key:** `~/.buildpilot/master.key` (32 random bytes, base64).
  On POSIX it's `chmod 0600`; on Windows it relies on the user-profile
  NTFS ACL. Delete the key and *all* encrypted values become
  unrecoverable — back it up if you back up your config.
- **Encrypted blob format:** `enc:1:<base64(iv | tag | ciphertext)>`.
  Encrypted-vs-plaintext detection is via the `enc:1:` prefix, so
  pre-existing plaintext values are migrated automatically on first read.
- **What's encrypted:** the field-name allow-list lives in
  [`apps/server/src/crypto/secrets.ts`](apps/server/src/crypto/secrets.ts)
  and covers: `botToken`, `password`, `accessKeyId`, `secretAccessKey`,
  `apiKeyId`, `apiIssuerId`, `appPassword`, `keychainPassword`,
  `sentryAuthToken`, `bugsnagApiKey`, `webhookUrl`, `smtpPassword`,
  `steamPassword`, `steamWebApiKey`, `steamGuardCode`, `ascPrivateKey`,
  `ascApiKey`, `apiKeyContents`, `filePassword`, `firebaseToken`.
- **Where:** pipeline node data (SQLite `pipelines.nodes_json`), node
  templates (`node_templates.data_json`), saved SSH hosts
  (`~/.buildpilot/hosts.json`), and the Telegram config in
  `~/.buildpilot/config.json`.

**What encryption does *not* protect against:** another local process
running as the same OS user. The threat model is "casual exposure" —
DB backups, screenshots of config files, accidentally committing a
config file — not a hostile local attacker.

If you're publishing this repo: a full secret-scan across every commit
showed zero leaked credentials. `.gitignore` excludes `.env*`,
`.buildpilot/`, and `*.sqlite` from day one.

## Data

- **Projects, pipelines, builds, build log entries, poller state,
  node templates:** `~/.buildpilot/db.sqlite` (SQLite, WAL mode).
- **Build artifact files:** `~/.buildpilot/artifacts/<buildId>/...`.
- **Saved SSH hosts:** `~/.buildpilot/hosts.json` (encrypted passwords).
- **Server config:** `~/.buildpilot/config.json` (encrypted Telegram
  secrets).
- **Master encryption key:** `~/.buildpilot/master.key`.

Removing a project cascades to its pipelines; build history is kept.

## Scripts

```bash
pnpm dev        # start server (:51731) + web (:51732) in parallel and open the browser
pnpm build      # production build of both apps
pnpm start      # run the built server (no web dev server)
pnpm typecheck  # tsc --noEmit across the workspace
pnpm test       # run vitest suites
pnpm seed       # populate a fresh DB with 3 demo projects + pipelines + history
```

The seed script is idempotent (skips if "Demo: iOS app" already exists)
and points each demo project at an isolated git repo in `$TMPDIR`. Use
`BUILDPILOT_HOME=/tmp/bp-dev pnpm seed` to seed into a sandbox directory
without touching your real `~/.buildpilot` install.

### Storybook

The web app ships a Storybook 8 component library so reviewers can browse
UI variants in isolation (no API / SSE required). Run
`pnpm --filter @buildpilot/web storybook` to launch the dev server on
`localhost:6006`, or `pnpm --filter @buildpilot/web build-storybook` to
emit a static bundle under `apps/web/storybook-static/`.

## Docs

- [docs/API.md](docs/API.md) — full HTTP + SSE reference
- [docs/PIPELINES.md](docs/PIPELINES.md) — pipeline DAG model, all 83
  step types with field reference, recipes
- [docs/WEBHOOKS.md](docs/WEBHOOKS.md) — GitHub / GitLab / Gitea /
  generic-API triggers with signature verification
- [docs/TELEGRAM.md](docs/TELEGRAM.md) — bot setup, commands, approval
  flow, troubleshooting
- [TODO.md](TODO.md) — living roadmap with commit-linked progress
- [docs/UX-ROADMAP.md](docs/UX-ROADMAP.md) — UI/UX + platform polish
  roadmap (companion to TODO.md)

## Roadmap highlights

See [`TODO.md`](TODO.md) for the full living roadmap. The biggest gaps
right now:

- [ ] LAN auth (basic / token + RBAC) — required before binding `0.0.0.0`
- [ ] File-vault credentials (replace per-step inline secret fields)
- [ ] Build matrix expansion (`os: [mac, win]` × `unity: [2022, 2023]`)
- [ ] Manual approval step with timeout
- [ ] ASC API auto-provisioning of certs / profiles
- [ ] Cron-driven schedules + tag/path filters on watch
- [ ] PWA + iOS Web Push so toasts arrive when the dashboard tab is closed
- [ ] Cloud device labs (BrowserStack / Firebase Test Lab)
- [ ] Observability — flaky test detection, build duration trending,
      JUnit/xcresult report rendering

## License

TBD — open-source license selection pending.
