# BuildPilot Desktop (tray app)

`apps/desktop` is an [Electron](https://www.electronjs.org/) wrapper that turns
BuildPilot into a **background app that lives in the Windows system tray** (and
the menu bar on macOS / the tray on Linux). It:

- **Starts the BuildPilot server in the background** on launch (or adopts one
  that's already running), so the whole stack comes up from a single click.
- **Auto-starts at login** — registered with the OS on first run and toggleable
  from the tray menu (`Açılışta Başlat`). It launches hidden into the tray.
- Shows a **tray icon**. **Left-click** opens/hides the BuildPilot window.
- **Right-click** opens a menu with **per-project shortcuts** — open the project
  in the panel/browser, open its folder on disk, `git pull`, `git fetch` — plus
  quick links to Builds, Queue, and Settings.
- Raises **native OS notifications** for pipeline events (build success/failure,
  awaiting approval, matrix results, new commits). Clicking a notification jumps
  straight to the relevant page.
- Opens the **full dashboard in an Electron window** (served from the server's
  own origin — no Vite dev server needed). `Tarayıcıda Aç` opens it in the
  default browser instead.

## Architecture

```
┌──────────────────────────── Electron main ────────────────────────────┐
│  main.ts      orchestrates startup, single-instance lock, lifecycle     │
│  server.ts    spawns / adopts the Fastify server, waits until healthy   │
│  api.ts       fetches projects + subscribes to the SSE /events stream   │
│  notify.ts    maps ServerEvent → native Notification                    │
│  tray.ts      builds the tray icon + dynamic context menu               │
│  window.ts    the BrowserWindow that loads http://127.0.0.1:51731       │
│  state.ts     launch-at-login preference (first-run default = on)       │
└─────────────────────────────────────────────────────────────────────────┘
```

The window loads the web SPA from the **server's own origin**. The server now
serves the built bundle (`apps/server/src/static-web.ts`); in dev that's a
no-op and Vite keeps serving on 51732.

## Develop / run locally

From the repo root (requires Node 20+ and pnpm 10+, plus `pnpm install` to pull
Electron):

```bash
pnpm desktop:dev
```

This builds the web bundle, then launches Electron. In dev the app spawns the
server via the workspace `tsx`, so the window loads the freshly built SPA from
`http://127.0.0.1:51731`. If you already have `pnpm dev` running, the app
adopts that server instead of starting a second one.

Override the target server with `BUILDPILOT_API_PORT` / `BUILDPILOT_HOST`, or
point at a custom launch command with `BUILDPILOT_SERVER_CMD`.

## Build a Windows installer (.exe)

> Packaging is done on the target OS. Build the Windows installer **on
> Windows**, the macOS app on macOS, etc.

```bash
# 1. Install deps (pulls Electron + electron-builder)
pnpm install

# 2. Provide real node_modules for the externalised server deps. electron
#    can't run native addons from inside an asar, so they ship as files:
pnpm --filter @buildpilot/server deploy --prod apps/desktop/server
#    (or copy apps/server/node_modules → apps/desktop/server/node_modules)

# 3. Rebuild native addons against Electron's Node ABI (better-sqlite3, ssh2):
cd apps/desktop && npx @electron/rebuild -m server/node_modules

# 4. Build the web bundle, the server bundle, and the installer:
pnpm desktop:dist
```

The installer lands in `apps/desktop/release/`. The NSIS installer creates
Start-menu + desktop shortcuts and registers the app to launch at login (hidden
into the tray).

### Native module caveat

`better-sqlite3` and `ssh2` are native addons. When the packaged server runs
under `ELECTRON_RUN_AS_NODE`, those binaries must match **Electron's** Node ABI,
not your system Node's. Step 3 above (`@electron/rebuild`) handles this. If you
prefer to run the server with a standalone Node runtime instead, set
`BUILDPILOT_SERVER_CMD` to point at it and skip the rebuild.

## macOS

The app runs fine on macOS — it's the same Electron codebase:

- It lives in the **menu bar** (not the Dock). On launch we call
  `app.dock.hide()` so it behaves as a background/accessory app, mirroring the
  Windows tray. The tray icon is resized to ~18px and marked as a *template
  image*, so the menu bar recolours it for light/dark mode automatically.
- On macOS a click on a menu-bar item opens its menu, so the window is reached
  via the menu's **BuildPilot'u Aç** entry (rather than a left-click toggle).
- **Auto-start at login** uses the same `setLoginItemSettings` call and works
  on macOS.
- **Notifications** work out of the box. In an unsigned dev build the system
  shows them under the name "Electron"; a signed `.app` shows "BuildPilot".

### Build a macOS app (.dmg)

Run **on a Mac**:

```bash
pnpm install
pnpm --filter @buildpilot/server deploy --prod apps/desktop/server
cd apps/desktop && npx @electron/rebuild -m server/node_modules   # native addons → Electron ABI
cd ../.. && pnpm desktop:dist:mac
```

The `.dmg` lands in `apps/desktop/release/`.

**Gatekeeper / signing:** an unsigned build runs, but the first launch needs
*right-click → Open* (or `xattr -dr com.apple.quarantine /Applications/BuildPilot.app`).
For distribution, set an Apple Developer ID in `electron-builder.yml` (`mac.identity`)
and enable notarization — see electron-builder's
[code signing docs](https://www.electron.build/code-signing). Apple Silicon vs
Intel: add `arch: [arm64, x64]` (or `universal`) under the `mac` target.

## Auto-start behaviour

On first launch the app registers itself with the OS login items
(`openAtLogin: true, openAsHidden: true`). Subsequent boots launch it with
`--hidden`, so it goes straight to the tray without popping a window. Toggle it
any time from the tray menu — your choice is remembered (`~/.buildpilot/desktop.json`)
and not overridden on the next boot.
