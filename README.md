# BuildPilot

Local CI/CD with a web dashboard and a React Flow pipeline editor.

A background daemon polls the git repos you register, surfaces an in-page
toast when a watched branch gets new commits, and runs build pipelines you
compose visually. The UI is a local web app — open it in any browser on the
same machine, or on the LAN, if you bind to `0.0.0.0`.

## Status

Phase 1 — single-host MVP for Unity dedicated-server builds on Windows.
Roadmap: iOS / Xcode / TestFlight pipelines via a remote Mac agent.

## Stack

- **Server:** Node.js + Fastify + SQLite (`better-sqlite3`) + `simple-git` (TypeScript)
- **Web:** React 18 + Vite + Tailwind + React Flow (`@xyflow/react`) + Zustand
- **Monorepo:** pnpm workspaces

## Layout

```
apps/
  server/    Fastify daemon (REST + SSE + git poller + pipeline engine)
  web/       React dashboard (project list, commit view, React Flow editor)
packages/
  shared-types/    TypeScript interfaces shared by server + web
  step-registry/   Pipeline node definitions (4 step types)
```

## Step types

Built-in pipeline node types:

| Type                          | What it does                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `checkout`                    | `git checkout <branch>`                                                            |
| `pull`                        | `git pull <remote>`                                                                |
| `gitMerge`                    | Merge another branch into HEAD (pair with AI auto-fix for conflict resolution)     |
| `shell`                       | Runs an arbitrary shell command in the project directory                           |
| `unityBatch`                  | `Unity -batchmode -nographics -quit -executeMethod <Method>`                       |
| `httpRequest`                 | Generic HTTP call (POST/GET/…) with headers and body                               |
| `slackNotify`                 | Posts a message to a Slack incoming webhook                                        |
| `discordNotify`               | Posts a message to a Discord webhook                                               |
| `telegramNotify`              | Sends a Telegram bot message (HTML / MarkdownV2 / plain)                           |
| `aiPrompt`                    | Runs `claude` / `codex` / `aider` / `gemini` (or a custom CLI) with a prompt       |
| `artifact`                    | Records build outputs into a downloadable artifact catalog                         |
| `s3Upload`                    | AWS S3 multipart upload + optional presigned URL + JSON manifest                   |
| `sftpUpload`                  | Single-file SFTP put with key OR password auth                                     |
| `remoteSsh`                   | Runs a shell command on a remote host via SSH (foundation for Mac iOS builds)      |
| `xcodebuild`                  | Drives `xcodebuild` for iOS / macOS — must run on a Mac (compose with `remoteSsh`) |
| `keychainUnlock`              | `security unlock-keychain` so codesign / xcodebuild don't prompt — local or remote |
| `provisioningProfileInstall`  | Drops a `.mobileprovision` into the right Mac directory — local or remote          |
| `testflightUpload`            | `xcrun altool --upload-app` wrapper (apiKey or appleId auth) — local or remote     |

Pipelines watch one branch and run on a configurable cadence; the build target
branch can differ from the watched branch via the `checkout` step. Edges between
nodes carry a condition (`success` / `failure` / `always`) — failure paths
let you wire up notify-on-break flows. Independent DAG branches run in
parallel up to a per-pipeline limit.

### AI auto-fix

Every step has an optional **AI Auto-Fix on failure** section. When enabled,
a step failure triggers the chosen AI tool (claude / codex / aider / gemini)
with a templated prompt (`{{step}}`, `{{error}}`, `{{nodeId}}`); after the
AI exits, BuildPilot retries the step. Loops up to `maxRetries` times
before bailing out. Useful for self-healing flake fixes, conflict
resolution, and "try the obvious thing" recovery.

### iOS / Mac builds (Phase 2)

BuildPilot drives a Mac builder over SSH from any host (Windows / Linux),
or runs Mac steps directly when installed on macOS. A full TestFlight
pipeline looks like:

```
checkout → pull → keychainUnlock ──► provisioningProfileInstall ──►
        remoteSsh (xcodebuild archive + exportArchive) ──► artifact ──►
        testflightUpload
```

Each Mac step (`keychainUnlock`, `provisioningProfileInstall`,
`testflightUpload`) accepts a saved-host id; if you leave it blank, the
step runs on the BuildPilot host directly. Composed with the **Saved SSH
hosts** dropdown (Sidebar → "SSH Hosts"), a typical Windows-driving-a-Mac
pipeline never has to retype credentials.

Fields you'll fill in on the `remoteSsh` step:
- **Saved host:** pick a Mac entry from `~/.buildpilot/hosts.json`, or fall
  back to the inline host fields below
- **Remote working dir:** the Mac-side clone of the same project
- **Command:**

  ```sh
  git pull && xcodebuild -workspace MyGame.xcworkspace -scheme MyGame \
    -configuration Release -destination 'generic/platform=iOS' \
    archive -archivePath build/MyGame.xcarchive
  ```

For BuildPilot running directly on a Mac, the `xcodebuild` step is a typed
shortcut for the same invocation.

#### TestFlight upload

The `testflightUpload` step wraps `xcrun altool --upload-app`. Two auth
methods:

- **API key (recommended):** put `AuthKey_<id>.p8` at
  `~/.appstoreconnect/private_keys/` on the Mac, then fill `apiKeyId` +
  `apiIssuerId` on the step.
- **Apple ID:** an Apple ID + app-specific password. Plaintext on the
  step until the secrets vault lands.

Pair with `keychainUnlock` (so xcodebuild can sign without a UI prompt)
and `provisioningProfileInstall` (so the right profile is on disk before
xcodebuild runs).

## Getting started

Requires Node 20+ and pnpm 10+.

```bash
pnpm install
pnpm dev
```

This starts:
- **Server** on `http://127.0.0.1:49831` (REST + SSE)
- **Web** on `http://127.0.0.1:49832` (Vite dev server, opens automatically)

Both ports sit in the IANA dynamic range (49152–65535) so they're very
unlikely to clash with other services.

The web app proxies `/api/*` and `/events` to the server. If you see a flash
of "no data" on first load, give the server one extra second and the
dashboard will refresh on its own (it does so on every SSE connect).

### Adding a project

Click the **+** button in the sidebar, paste an absolute path to a git repo,
and confirm. BuildPilot auto-detects the default branch (`main`/`master`),
lists local branches, and shows commit history with collapsible bodies.

### Creating a pipeline

Open a project, click **New pipeline**. The starter graph is
`checkout → pull → unityBatch` — fill in the Unity executable path and
build method, then **Run**. Drag more nodes from the left palette to extend
the graph; click any node to edit its properties on the right.

### Watching a branch

Each pipeline has a `watch` configuration: `branch` + `intervalSec`. The
poller fetches the remote on that cadence; when the watched branch advances,
a toast appears in the dashboard listing the new commits with **Pull** and
**Pull & Build** buttons.

> The watched branch is independent of the branch the pipeline checks out —
> e.g., watch `development`, then `checkout` to `ios-release` and merge.

## Configuration

On first run a default config is written to `~/.buildpilot/config.json`:

```json
{
  "host": "127.0.0.1",
  "port": 49831,
  "pollIntervalSec": 60,
  "dbPath": "~/.buildpilot/db.sqlite",
  "webOrigin": "http://127.0.0.1:49832"
}
```

If you previously ran an older build that used ports 7777/5173, BuildPilot
auto-migrates the config on startup; restart the dev server after upgrading.

Set `host` to `0.0.0.0` to expose the dashboard on your LAN. **There is no
authentication** — only do this on a network you trust (or front it with
Tailscale).

## Data

- **Projects, pipelines, builds, poller state:** `~/.buildpilot/db.sqlite`
  (SQLite, WAL mode).
- **Build logs:** stored inline in the `builds` row; streamed live to all
  connected clients via SSE.

Removing a project cascades to its pipelines; build history is kept.

## Scripts

```bash
pnpm dev        # start server (:49831) + web (:49832) in parallel and open the browser
pnpm build      # production build of both apps
pnpm typecheck  # tsc --noEmit across the workspace
```

## HTTP API

Everything the dashboard does is also exposed as plain JSON over HTTP, so you
can register projects, design pipelines, and trigger builds entirely from
scripts. The dashboard listens on the SSE feed and refreshes itself whenever
something changes — projects/pipelines/builds you create from `curl` show up
live without a manual reload.

Base URL: `http://127.0.0.1:49831`

### Projects

```bash
# Register a local git repo
curl -X POST http://127.0.0.1:49831/api/projects \
  -H 'content-type: application/json' \
  -d '{"path": "C:/work/my-game", "name": "MyGame"}'

# List / get / delete
curl http://127.0.0.1:49831/api/projects
curl http://127.0.0.1:49831/api/projects/<id>
curl -X DELETE http://127.0.0.1:49831/api/projects/<id>

# Branches + commit history
curl http://127.0.0.1:49831/api/projects/<id>/branches
curl 'http://127.0.0.1:49831/api/projects/<id>/commits?branch=main&limit=50'

# git fetch / git pull
curl -X POST http://127.0.0.1:49831/api/projects/<id>/fetch
curl -X POST http://127.0.0.1:49831/api/projects/<id>/pull
```

### Pipelines

A pipeline is a DAG of step nodes (`checkout`, `pull`, `shell`, `unityBatch`)
connected by edges. Position fields are only used by the visual editor; you
can pass arbitrary x/y values from a script.

```bash
curl -X POST http://127.0.0.1:49831/api/pipelines \
  -H 'content-type: application/json' \
  -d '{
    "projectId": "<project-id>",
    "name": "Linux dedicated server",
    "watch": { "branch": "development", "intervalSec": 60, "autoTrigger": "ask" },
    "nodes": [
      { "id": "n1", "type": "checkout",   "position": {"x":0,  "y":0}, "data": {"branch":"development"} },
      { "id": "n2", "type": "pull",       "position": {"x":240,"y":0}, "data": {"remote":"origin"} },
      { "id": "n3", "type": "shell",      "position": {"x":480,"y":0}, "data": {"command":"pnpm install"} },
      { "id": "n4", "type": "unityBatch", "position": {"x":720,"y":0},
        "data": {
          "unityPath":"C:/Program Files/Unity/Hub/Editor/2022.3.40f1/Editor/Unity.exe",
          "buildTarget":"StandaloneLinux64",
          "executeMethod":"BuildScript.BuildDedicatedServer"
        }}
    ],
    "edges": [
      { "id":"e1", "source":"n1", "target":"n2", "condition":"success" },
      { "id":"e2", "source":"n2", "target":"n3", "condition":"success" },
      { "id":"e3", "source":"n3", "target":"n4", "condition":"success" }
    ]
  }'

# List / patch / delete
curl http://127.0.0.1:49831/api/pipelines
curl http://127.0.0.1:49831/api/pipelines/<id>
curl -X PATCH http://127.0.0.1:49831/api/pipelines/<id> \
  -H 'content-type: application/json' \
  -d '{"watch":{"branch":"main","intervalSec":120,"autoTrigger":"pullAndBuild"}}'
curl -X DELETE http://127.0.0.1:49831/api/pipelines/<id>
```

### Builds

```bash
# Trigger a build
curl -X POST http://127.0.0.1:49831/api/builds \
  -H 'content-type: application/json' \
  -d '{"pipelineId":"<id>"}'

# History (all builds, every log preserved)
curl 'http://127.0.0.1:49831/api/builds?limit=50'
curl 'http://127.0.0.1:49831/api/builds?projectId=<id>'
curl 'http://127.0.0.1:49831/api/builds?pipelineId=<id>'

# Single build with full log
curl http://127.0.0.1:49831/api/builds/<build-id>
```

### Live event stream

```bash
curl -N http://127.0.0.1:49831/events
```

Emits `newCommit`, `pollerTick`, `buildStarted`, `buildLog`, `buildFinished`,
`projectAdded`, `projectRemoved`, `pipelineChanged`. The dashboard reloads
its lists on every relevant event, so anything you create via the API
appears immediately.

## Roadmap

See `TODO.md` for the full living roadmap with commit-linked done items.
Highlights of what's next:

- [ ] LAN auth (basic / token) — required before binding `0.0.0.0`
- [ ] PWA + iOS Web Push so toasts arrive when the dashboard tab is closed
- [ ] Pipeline templates (group of nodes) + pipeline versioning
- [ ] Step inputs / outputs — `${{checkout.sha}}` interpolation between steps
- [ ] Webhook-driven polling (GitHub / Gitea push) instead of cron poll
