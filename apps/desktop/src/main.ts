import { app, dialog } from 'electron';
import type { ServerEvent } from '@buildpilot/shared-types';
import { ensureServer, registerProcessTeardown, stopServer } from './server';
import { subscribeEvents } from './api';
import { handlePipelineEvent } from './notify';
import {
  createTray,
  destroyTray,
  rebuildTrayMenu,
  scheduleTrayRebuild,
  scheduleTrayStatusRefresh,
  setServerHealth,
} from './tray';
import { applyFirstRunDefaults } from './state';
import { setQuitting, showWindow } from './window';

// Windows: native toast notifications only display when the app declares an
// AppUserModelID matching its (installed) Start Menu shortcut — without it
// Electron's Notification silently no-ops and Windows can't attribute the toast
// to BuildPilot. Must equal electron-builder.yml's `appId` (the NSIS installer
// registers the same AUMID on the shortcut). No-op on macOS & Linux.
if (process.platform === 'win32') {
  app.setAppUserModelId('dev.buildpilot.desktop');
}

// Single-instance: a second launch (or the user double-clicking the shortcut
// again) just surfaces the existing window instead of starting a rival server.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow('/'));
  void start();
}

let unsubscribe: (() => void) | null = null;

const serverLog = (line: string): void => console.log('[server]', line);

// Backstop teardown: if the Electron main is killed by a signal or exits
// without going through 'before-quit' (Ctrl-C in dev, OS shutdown), this fires
// a synchronous kill of the owned server child so no node/server is orphaned.
registerProcessTeardown(serverLog);

async function start(): Promise<void> {
  await app.whenReady();

  // macOS: run as a menu-bar-only background app — no Dock icon, no Cmd+Tab
  // entry — mirroring the Windows system-tray behaviour.
  if (process.platform === 'darwin') app.dock?.hide();

  // Tray app: closing the last window must not quit the process. Subscribing
  // to this event (and not calling app.quit()) suppresses the default
  // quit-on-last-window-closed behaviour on Windows/Linux.
  app.on('window-all-closed', () => {
    /* keep running in the tray */
  });

  applyFirstRunDefaults();
  await createTray();

  const ok = await ensureServer(serverLog);
  setServerHealth(ok);
  if (!ok) {
    dialog.showErrorBox(
      'BuildPilot',
      'Failed to start the BuildPilot server. Check the logs.',
    );
  } else {
    // Server is up — populate the tray with the real project list (createTray
    // only set a synchronous placeholder).
    void rebuildTrayMenu();
  }

  // Stream pipeline events → OS notifications. Only project add/remove changes
  // the tray's project shortcuts; rebuild is debounced to coalesce bursts. The
  // SSE stream only delivers frames while the server is reachable, so any
  // event is also a liveness signal — reflect that in the tray's health line.
  unsubscribe = subscribeEvents((e: ServerEvent) => {
    setServerHealth(true);
    handlePipelineEvent(e);
    if (e.type === 'projectAdded' || e.type === 'projectRemoved') {
      scheduleTrayRebuild();
    } else if (
      e.type === 'buildStarted' ||
      e.type === 'buildFinished' ||
      e.type === 'buildAwaitingApproval' ||
      e.type === 'buildApprovalDecided'
    ) {
      // Build lifecycle changes the running/queued counts — refresh the tray's
      // status line (cheap queue fetch, debounced).
      scheduleTrayStatusRefresh();
    }
  });

  // Stay in the tray when launched at login: Windows/Linux pass `--hidden`
  // (set in setLoginItemSettings); macOS doesn't forward args, so consult the
  // login-item settings directly. A manual launch opens the window.
  const launchedAtLogin =
    process.argv.includes('--hidden') ||
    app.getLoginItemSettings().wasOpenedAtLogin;
  if (!launchedAtLogin) showWindow('/');
}

app.on('before-quit', () => {
  setQuitting(true);
  unsubscribe?.();
  destroyTray();
  // Mark teardown and ask the owned server to stop gracefully (SIGTERM →
  // SIGKILL on POSIX; tree-kill on Windows). before-quit is synchronous so we
  // can't await here, but stopServer flips the shutting-down flag immediately
  // (suppressing auto-restart) and the registered process-exit backstop
  // guarantees the child is killed even if the async escalation is cut short.
  void stopServer(serverLog);
});
