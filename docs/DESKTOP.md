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

## Fully self-contained — no Node on the target PC

The produced installer is **self-contained**: the target machine needs **no
Node, no npm, no JavaScript runtime, and no build tools** installed. This works
because:

- **Electron ships its own Node runtime.** The packaged server runs under
  `ELECTRON_RUN_AS_NODE` — i.e. the Electron binary acting as Node — so there's
  no dependency on a system Node install.
- The server is **bundled** (esbuild → `server/index.cjs`) with every pure-JS
  dependency inlined. The only things that can't be inlined — the native addons
  (`better-sqlite3`, `ssh2`) and the pino logging family — are **installed and
  shipped** as real `node_modules` beside the bundle, and the native ones are
  **rebuilt against Electron's Node ABI** at packaging time.

The *build machine* still needs the tooling (Node, pnpm, and a C/C++ toolchain +
Python for the native rebuild). The *installed app* needs none of it.

## Build a Windows installer (.exe)

> Build on the target OS: Windows installer **on Windows**, macOS app on macOS,
> Linux AppImage on Linux. (Native modules are rebuilt per-platform.)

```bash
pnpm install        # once — pulls Electron, electron-builder, @electron/rebuild
pnpm desktop:dist   # builds web + server bundle, prepares the runtime, packages
```

That single `desktop:dist` runs the whole pipeline:

1. `tsc` → Electron main process (`dist/`)
2. esbuild → server bundle (`server/index.cjs`)
3. `scripts/prepare-resources.mjs` → installs the external runtime deps into
   `server/node_modules` and rebuilds the native ones for Electron's ABI
4. `electron-builder` → the installer in `apps/desktop/release/`

The NSIS installer creates Start-menu + desktop shortcuts and registers the app
to launch at login (hidden into the tray).

**Build-machine prerequisites for the native rebuild (step 3):**

- **Windows:** Visual Studio Build Tools (C++ workload) + Python 3
- **macOS:** Xcode Command Line Tools (`xcode-select --install`)
- **Linux:** `build-essential` + Python 3

> Alternatively, point `BUILDPILOT_SERVER_CMD` at a standalone Node runtime to
> run the server outside Electron — then you can skip the native rebuild, at the
> cost of requiring that Node on the target. Not recommended for distribution.

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

Run **on a Mac** (with Xcode Command Line Tools installed for the native
rebuild). Same single command as Windows — it builds for both arm64 + x64:

```bash
pnpm install
pnpm --filter @buildpilot/desktop run dist:mac
```

The `.dmg` lands in `apps/desktop/release/` and is self-contained — no Node
needed on the Mac it's installed on.

**Gatekeeper / signing:** an unsigned build runs, but the first launch needs
*right-click → Open* (or `xattr -dr com.apple.quarantine /Applications/BuildPilot.app`).
For distribution, set an Apple Developer ID in `electron-builder.yml` (`mac.identity`)
and enable notarization — see electron-builder's
[code signing docs](https://www.electron.build/code-signing).

## Auto-start behaviour

On first launch the app registers itself with the OS login items
(`openAtLogin: true, openAsHidden: true`). Subsequent boots launch it with
`--hidden`, so it goes straight to the tray without popping a window. Toggle it
any time from the tray menu — your choice is remembered (`~/.buildpilot/desktop.json`)
and not overridden on the next boot.
