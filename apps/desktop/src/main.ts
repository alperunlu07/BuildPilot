import { app, dialog } from 'electron';
import type { ServerEvent } from '@buildpilot/shared-types';
import { ensureServer, stopServer } from './server';
import { subscribeEvents } from './api';
import { handlePipelineEvent } from './notify';
import { createTray, destroyTray, rebuildTrayMenu } from './tray';
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
  }

  // Stream pipeline events → OS notifications. Project lifecycle events also
  // refresh the tray shortcuts so the menu always reflects the current set.
  unsubscribe = subscribeEvents((e: ServerEvent) => {
    handlePipelineEvent(e);
    if (
      e.type === 'projectAdded' ||
      e.type === 'projectRemoved' ||
      e.type === 'pipelineChanged'
    ) {
      void rebuildTrayMenu();
    }
  });

  // Launched at login (`--hidden`) → stay in the tray. A manual launch opens
  // the window so the user sees something happened.
  if (!process.argv.includes('--hidden')) showWindow('/');
}

app.on('before-quit', () => {
  setQuitting(true);
  unsubscribe?.();
  destroyTray();
  stopServer();
});
