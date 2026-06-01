import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { app } from 'electron';
import { DESKTOP_STATE_FILE } from './config';

interface DesktopState {
  // Whether we've completed the one-time first-run setup (enabling launch at
  // login by default). Lets the user later turn it off without us flipping it
  // back on every boot.
  initialized: boolean;
}

function read(): DesktopState {
  try {
    return JSON.parse(readFileSync(DESKTOP_STATE_FILE, 'utf8')) as DesktopState;
  } catch {
    return { initialized: false };
  }
}

function write(state: DesktopState): void {
  mkdirSync(dirname(DESKTOP_STATE_FILE), { recursive: true });
  writeFileSync(DESKTOP_STATE_FILE, JSON.stringify(state, null, 2));
}

// Register/unregister the app with the OS so it starts automatically at login.
// `openAsHidden` keeps it in the tray on boot rather than popping a window.
export function setLaunchAtLogin(enabled: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true,
    // Windows: launch with --hidden so main.ts knows to stay in the tray.
    args: ['--hidden'],
  });
}

export function isLaunchAtLogin(): boolean {
  return app.getLoginItemSettings().openAtLogin;
}

// On the very first run, opt the user into launch-at-login (the whole point of
// a tray app) — but only once, so a later opt-out sticks.
export function applyFirstRunDefaults(): void {
  // write() ensures CONFIG_DIR exists (recursive mkdir), so no separate
  // directory check is needed here.
  const state = read();
  if (!state.initialized) {
    setLaunchAtLogin(true);
    write({ ...state, initialized: true });
  }
}
