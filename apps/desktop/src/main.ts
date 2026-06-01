import { app, dialog } from 'electron';
import type { ServerEvent } from '@buildpilot/shared-types';
import { ensureServer, stopServer } from './server';
import { subscribeEvents } from './api';
import { handlePipelineEvent } from './notify';
import { createTray, destroyTray, rebuildTrayMenu, scheduleTrayRebuild } from './tray';
import { applyFirstRunDefaults } from './state';
import { setQuitting, showWindow } from './window';

// Single-instance: a second launch (or the user double-clicking the shortcut
// again) just surfaces the existing window instead of starting a rival server.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow('/'));
  void start();
}

let unsubscribe: (() => void) | null = null;

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

  const ok = await ensureServer((line) => console.log('[server]', line));
  if (!ok) {
    dialog.showErrorBox(
      'BuildPilot',
      'BuildPilot sunucusu başlatılamadı. Günlükleri kontrol edin.',
    );
  } else {
    // Server is up — populate the tray with the real project list (createTray
    // only set a synchronous placeholder).
    void rebuildTrayMenu();
  }

  // Stream pipeline events → OS notifications. Only project add/remove changes
  // the tray's project shortcuts; rebuild is debounced to coalesce bursts.
  unsubscribe = subscribeEvents((e: ServerEvent) => {
    handlePipelineEvent(e);
    if (e.type === 'projectAdded' || e.type === 'projectRemoved') {
      scheduleTrayRebuild();
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
  stopServer();
});
