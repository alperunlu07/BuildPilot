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

Four built-in pipeline node types:

| Type         | What it does                                                  |
| ------------ | ------------------------------------------------------------- |
| `checkout`   | `git checkout <branch>`                                       |
| `pull`       | `git pull <remote>`                                           |
| `shell`      | Runs an arbitrary shell command in the project directory      |
| `unityBatch` | `Unity -batchmode -nographics -quit -executeMethod <Method>`  |

Pipelines watch one branch and run on a configurable cadence; the build target
branch can differ from the watched branch via the `checkout` step.

## Getting started

Requires Node 20+ and pnpm 10+.

```bash
pnpm install
pnpm dev
```

This starts:
- **Server** on `http://127.0.0.1:7777` (REST + SSE)
- **Web** on `http://127.0.0.1:5173` (Vite dev server, opens automatically)

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
  "port": 7777,
  "pollIntervalSec": 60,
  "dbPath": "~/.buildpilot/db.sqlite",
  "webOrigin": "http://127.0.0.1:5173"
}
```

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
pnpm dev        # start server (:7777) + web (:5173) in parallel and open the browser
pnpm build      # production build of both apps
pnpm typecheck  # tsc --noEmit across the workspace
```

## Roadmap

- [ ] iOS pipeline: `xcodebuild` step + remote Mac build agent over SSH
- [ ] TestFlight upload via App Store Connect API
- [ ] Multi-pipeline parallel builds with queue
- [ ] PWA + iOS Web Push so toasts arrive when the dashboard tab is closed
- [ ] Build cancellation, retry, restart-from-step
- [ ] Discord/Slack webhook notifications
