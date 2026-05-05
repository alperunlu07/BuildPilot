# BuildPilot

Local CI/CD with a web dashboard and a React Flow pipeline editor.

A background daemon polls the git repos you register, notifies you of new
commits on watched branches, and runs build pipelines you compose visually.
The UI is a local web app — open it in any browser on the same machine
(or on the LAN, if you bind to `0.0.0.0`).

## Status

Phase 1 — single-host MVP for Unity dedicated-server builds on Windows.
Roadmap: iOS / Xcode / TestFlight pipelines via remote Mac agent.

## Stack

- **Server:** Node.js + Fastify + SQLite (`better-sqlite3`) + `simple-git`
- **Web:** React 18 + Vite + Tailwind + React Flow (`@xyflow/react`) + Zustand
- **Monorepo:** pnpm workspaces

## Layout

```
apps/
  server/    Fastify daemon (REST + SSE)
  web/       React dashboard
packages/
  shared-types/    TypeScript interfaces shared by server + web
  step-registry/   Pipeline node definitions (4 step types)
```

## Getting started

```bash
pnpm install
pnpm dev          # starts server (:7777) + web (:5173) and opens the browser
```

Open <http://localhost:5173> if it doesn't auto-open.

## Configuration

On first run a default config is written to `~/.buildpilot/config.json`:

```json
{
  "host": "127.0.0.1",
  "port": 7777,
  "pollIntervalSec": 60,
  "dbPath": "~/.buildpilot/db.sqlite"
}
```

Set `host` to `0.0.0.0` to expose the dashboard on your LAN. There is no
auth — only do this on a network you trust.
