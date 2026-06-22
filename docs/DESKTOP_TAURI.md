# BuildPilot Desktop — Tauri v2 (`apps/desktop-tauri`)

`apps/desktop-tauri` is a **[Tauri v2](https://v2.tauri.app/) rewrite** of the
Electron tray app (`apps/desktop`). It turns BuildPilot into a **background app
that lives in the system tray** (the menu bar on macOS / the tray on Linux),
with the whole native layer written in **Rust** instead of Node/Electron.

It is feature-for-feature equivalent to the Electron app:

- **Starts the BuildPilot server in the background** on launch (or **adopts** one
  that's already running — e.g. your own `pnpm dev` — and never kills it), so the
  whole stack comes up from a single click.
- **Health monitoring + auto-restart:** a spawned server that dies unexpectedly
  is respawned with a capped exponential backoff (giving up after 5 rapid
  failures); a restart that answers `/api/health` resets the counter.
- **Auto-starts at login** — registered with the OS on first run and toggleable
  from the tray menu. It launches hidden into the tray (`--hidden`).
- Shows a **tray icon**. **Left-click** toggles the BuildPilot window;
  **right-click** opens the context menu.
- The menu has a **server-health line**, live **running/queued counts** (only
  shown when non-zero), **per-project submenus** — open in panel/browser, open
  the project folder on disk, `git pull`, `git fetch`, and **one-click pipeline
  runs** — plus quick links to Builds, Queue, and Settings, a **Launch at Login**
  checkbox, **Restart**, and **Quit**.
- Raises **native OS notifications** for pipeline events (build success/failure,
  awaiting approval, matrix results, new commits).
- Opens the **full dashboard in a Tauri (WebView) window** loaded from the
  server's own origin. External links open in the default browser.
- **Single-instance lock:** a second launch just surfaces the existing window.

## Architecture

```
┌──────────────────────────── Tauri (Rust) ─────────────────────────────┐
│  lib.rs      orchestrates startup, single-instance, lifecycle, state    │
│  server.rs   spawns / adopts the Fastify server, supervises + restarts  │
│  api.rs      fetches projects + subscribes to the SSE /events stream     │
│  notify.rs   maps a server event → native notification                  │
│  tray.rs     builds the tray icon + dynamic context menu                │
│  window.rs   the WebView window that loads http://127.0.0.1:51731       │
│  state.rs    launch-at-login preference (first-run default = on)        │
│  config.rs   resolves host/port/token from ~/.buildpilot/*.json          │
│  models.rs   serde models for the subset of shared-types we consume      │
└─────────────────────────────────────────────────────────────────────────┘
```

The window loads the web SPA from the **server's own origin** (an external URL),
exactly like the Electron app — the server serves the built bundle
(`apps/server/src/static-web.ts`). Menu clicks push client-side routes in-app via
`history.pushState` so the SPA isn't reloaded on every click.

### Talking to the server

The app discovers the server's **host and port from the same
`~/.buildpilot/config.json` the server reads** (falling back to the documented
`127.0.0.1:51731`), so the two never disagree. `BUILDPILOT_HOME` relocates that
file for both sides; `BUILDPILOT_SERVER_CMD` launches the server with a custom
command.

**Auth-enabled servers.** When `auth.enabled` is true, give the app an API token
(generate one on the dashboard's **API tokens** page) via either the
`BUILDPILOT_API_TOKEN` env var or an `apiToken` field in
`~/.buildpilot/desktop.json`. It's sent as `Authorization: Bearer …` on every
API/SSE call. No token is needed on a default (auth-disabled) install.

## Develop / run locally

Requires **Rust** (stable, 1.77+), **Node 20+**, **pnpm 10+**, and the
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS
(on Linux: `webkit2gtk-4.1`, `gtk3`, `libayatana-appindicator3`, `librsvg2`).

```bash
pnpm install            # JS deps (Tauri CLI, esbuild)
pnpm desktop-tauri:dev  # = tauri dev
```

In dev the app spawns the server via the workspace `tsx` (same as the Electron
app's dev mode); if you already have `pnpm dev` running, it adopts that server
instead. The window loads the SPA from `http://127.0.0.1:51731`.

## Server runtime — there is no embedded Node

Unlike Electron (which ships its own Node and ran the server under
`ELECTRON_RUN_AS_NODE`), **Tauri bundles only a WebView — there is no embedded
JavaScript runtime.** So the packaged app ships the server as resources and runs
it with a **real Node**:

1. `bundle-server.mjs` — esbuild bundles the Fastify server into
   `src-tauri/resources/server/index.cjs` (target `node20`). Every pure-JS dep is
   inlined; only the externals that can't be (`better-sqlite3`, `ssh2`, the pino
   family) stay external.
2. `prepare-resources.mjs` — `npm install`s those externals into
   `src-tauri/resources/server/node_modules` (pinned to the exact versions in
   `apps/server/node_modules`), and copies the built web bundle into
   `src-tauri/resources/web/dist`.
3. At runtime (`server.rs`), the packaged app runs `node resources/server/index.cjs`
   using a **shipped `resources/runtime/node[.exe]`** if present, otherwise the
   **system `node`**. `BUILDPILOT_WEB_DIST` points the server at the bundled SPA.

> **Native addons & Node ABI.** Because the server runs under ordinary Node (not
> Electron), the native addons are built for plain Node's ABI by the `npm
> install` itself — **no `@electron/rebuild` step**. If you ship a Node runtime in
> `resources/runtime/`, make its major version match the one that built the
> addons (or rely on a same-major system Node). To be fully self-contained like
> the Electron installer, drop a Node binary at
> `src-tauri/resources/runtime/node` (or `node.exe`) before packaging.

Launch resolution order (in `server.rs`), mirroring the Electron app:

1. `BUILDPILOT_SERVER_CMD` — explicit override (`node /path/server.cjs`).
2. Packaged — the bundled `resources/server/index.cjs` run with Node.
3. Dev checkout — the TS source run through the workspace `tsx`.

## Build installers

> Build on the target OS: Windows installer **on Windows**, `.dmg`/`.app` on
> macOS, AppImage on Linux.

```bash
pnpm install
pnpm --filter @buildpilot/desktop-tauri run icons   # once — generate the icon set
pnpm desktop-tauri:dist
```

`desktop-tauri:dist` runs the whole pipeline: build the web bundle → bundle the
server → prepare resources → `tauri build` (which compiles the Rust and produces
the platform installer under `src-tauri/target/release/bundle/`).

### Icons

Tauri needs a generated icon set (`.ico`, `.icns`, sized PNGs). Run
`pnpm --filter @buildpilot/desktop-tauri run icons` (`tauri icon …/icon.png`) to
generate them into `src-tauri/icons/`. The brand source PNG/SVG and the tray
images (`tray.png`, `trayTemplate.png` for the macOS template) are committed.

## Relationship to `apps/desktop` (Electron)

Both apps coexist on this branch so you can compare/test the Tauri build before
retiring the Electron one. They are mutually exclusive at runtime (both want to
own the tray + the loopback server) — run only one at a time. Once the Tauri app
is validated, `apps/desktop` (Electron) can be removed and `desktop:*` root
scripts dropped in favour of `desktop-tauri:*`.
