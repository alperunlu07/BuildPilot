import { BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { getBaseUrl } from './config';

let win: BrowserWindow | null = null;

// Tracks whether the current document has finished loading. `win` being
// non-null is NOT a proxy for "loaded" — loadURL is async — so in-app
// (pushState) navigation must wait for this, and a failed load must fall back
// to a fresh loadURL instead of scripting a blank/error page.
let loaded = false;

// True once app.quit() has been requested, so the close handler knows to let
// the window actually close instead of hiding it back to the tray.
let quitting = false;
export function setQuitting(v: boolean): void {
  quitting = v;
}

function create(): BrowserWindow {
  const w = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'BuildPilot',
    icon: join(__dirname, '..', 'build', 'icon.png'),
    backgroundColor: '#0b0f1a',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  // Closing the window only hides it — the app keeps running in the tray.
  // A real quit (tray → Quit) flips `quitting` first.
  w.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      w.hide();
    }
  });
  w.on('closed', () => {
    win = null;
    loaded = false;
  });

  // Track load state so navigation picks pushState vs a full reload correctly.
  w.webContents.on('did-start-loading', () => {
    loaded = false;
  });
  w.webContents.on('did-finish-load', () => {
    loaded = true;
  });
  w.webContents.on('did-fail-load', () => {
    loaded = false;
  });

  // Open external links (target=_blank, http(s) outside our origin) in the
  // user's default browser rather than spawning child windows.
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(getBaseUrl())) {
      void shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  return w;
}

// Show the window, navigating to `path` (a client-side route like
// "/projects" or "/builds/123") when provided. Creates the window lazily on
// first use so startup stays light until the user actually opens the UI.
export function showWindow(path = '/'): void {
  if (!win) {
    win = create();
    void win.loadURL(`${getBaseUrl()}${path}`);
  } else if (loaded) {
    // Page is up — push the new route in-app so we don't reload the SPA on
    // every menu click.
    void win.webContents.executeJavaScript(
      `window.history.pushState({}, '', ${JSON.stringify(
        path,
      )}); window.dispatchEvent(new PopStateEvent('popstate'));`,
    );
  } else {
    // Window exists but is still loading (rapid clicks at startup) or the last
    // load failed (server was briefly down) — do a fresh load to the target
    // path rather than scripting a not-yet-ready / error page.
    void win.loadURL(`${getBaseUrl()}${path}`);
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

export function toggleWindow(): void {
  if (win && win.isVisible() && !win.isMinimized()) {
    win.hide();
  } else {
    showWindow();
  }
}

export function openInBrowser(path = '/'): void {
  void shell.openExternal(`${getBaseUrl()}${path}`);
}
