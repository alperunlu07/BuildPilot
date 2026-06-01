import { BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { BASE_URL } from './config';

let win: BrowserWindow | null = null;

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
  // A real quit (tray → Çıkış) flips `quitting` first.
  w.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      w.hide();
    }
  });
  w.on('closed', () => {
    win = null;
  });

  // Open external links (target=_blank, http(s) outside our origin) in the
  // user's default browser rather than spawning child windows.
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(BASE_URL)) {
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
    void win.loadURL(`${BASE_URL}${path}`);
  } else {
    // Already loaded — push the new route in-app so we don't trigger a full
    // reload of the SPA on every menu click.
    void win.webContents.executeJavaScript(
      `window.history.pushState({}, '', ${JSON.stringify(
        path,
      )}); window.dispatchEvent(new PopStateEvent('popstate'));`,
    );
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
  void shell.openExternal(`${BASE_URL}${path}`);
}
