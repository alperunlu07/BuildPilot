import { app, Menu, Tray, nativeImage, shell, type MenuItemConstructorOptions } from 'electron';
import { join } from 'node:path';
import { fetchProjects } from './api';
import { getAuthHeaders, getBaseUrl } from './config';
import { isLaunchAtLogin, setLaunchAtLogin } from './state';
import { openInBrowser, showWindow, toggleWindow } from './window';

let tray: Tray | null = null;

// Last-known server health, surfaced as a disabled status line at the top of
// the menu. null = not yet probed (cold start). Updated via setServerHealth on
// health changes (see main.ts) without re-fetching the project list.
let serverHealthy: boolean | null = null;

// Cache of the most recently fetched projects so a health-only update can
// rebuild the native menu without firing another fetch.
let lastProjects: ReadonlyArray<{ id: string; name: string; path: string }> = [];
let lastPlaceholder: string | undefined = '(loading…)';

function serverHealthLabel(): string {
  if (serverHealthy === null) return 'Server: checking…';
  return serverHealthy ? 'Server: running' : 'Server: not responding';
}

async function postAction(path: string): Promise<void> {
  try {
    await fetch(`${getBaseUrl()}${path}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    /* best-effort; the panel surfaces the real error/state */
  }
}

// Build the per-project submenu: a deep-link into the panel plus the quick
// actions a user reaches for from the tray — open the files on disk, pull,
// or fetch — without opening the full UI.
function projectSubmenu(
  project: { id: string; name: string; path: string },
): MenuItemConstructorOptions {
  return {
    label: project.name,
    submenu: [
      { label: 'Open in Panel', click: () => showWindow('/projects') },
      { label: 'Open in Browser', click: () => openInBrowser('/projects') },
      { type: 'separator' },
      {
        label: 'Open Project Folder',
        click: () => void shell.openPath(project.path),
      },
      { type: 'separator' },
      {
        label: 'Git Pull',
        click: () => void postAction(`/api/projects/${project.id}/pull`),
      },
      {
        label: 'Git Fetch',
        click: () => void postAction(`/api/projects/${project.id}/fetch`),
      },
    ],
  };
}

// Build the context menu from a known project list. `placeholder` renders a
// disabled stand-in for the project group when we don't yet have data (cold
// start, before the server is up) instead of firing a fetch.
function buildMenu(
  projects: ReadonlyArray<{ id: string; name: string; path: string }>,
  placeholder?: string,
): Menu {
  const projectItems: MenuItemConstructorOptions[] = placeholder
    ? [{ label: placeholder, enabled: false }]
    : projects.length > 0
      ? projects.map((p) => projectSubmenu(p))
      : [{ label: '(no projects)', enabled: false }];

  return Menu.buildFromTemplate([
    // Disabled status line reflecting last-known server health.
    { label: serverHealthLabel(), enabled: false },
    { type: 'separator' },
    { label: 'Open BuildPilot', click: () => showWindow('/') },
    { label: 'Open in Browser', click: () => openInBrowser('/') },
    { type: 'separator' },
    { label: 'Projects', submenu: projectItems },
    { type: 'separator' },
    { label: 'Builds', click: () => showWindow('/builds') },
    { label: 'Queue', click: () => showWindow('/queue') },
    { label: 'Settings', click: () => showWindow('/settings') },
    { type: 'separator' },
    {
      label: 'Launch at Login',
      type: 'checkbox',
      checked: isLaunchAtLogin(),
      click: (item) => setLaunchAtLogin(item.checked),
    },
    { type: 'separator' },
    { label: 'Quit', role: 'quit' },
  ]);
}

// Fetch the current project set and apply the menu. Called once after the
// server is up and thereafter (debounced) on project add/remove events.
export async function rebuildTrayMenu(): Promise<void> {
  if (!tray) return;
  const projects = await fetchProjects();
  lastProjects = projects;
  lastPlaceholder = undefined;
  if (tray) tray.setContextMenu(buildMenu(projects));
}

// Update the last-known server health and refresh the menu's status line in
// place (reusing the cached project list — no fetch). No-op if the value
// hasn't actually changed, so repeated identical health probes don't rebuild
// the native menu needlessly.
export function setServerHealth(healthy: boolean): void {
  if (serverHealthy === healthy) return;
  serverHealthy = healthy;
  if (tray) tray.setContextMenu(buildMenu(lastProjects, lastPlaceholder));
}

let rebuildTimer: ReturnType<typeof setTimeout> | null = null;

// Coalesce a burst of project events (e.g. importing several repos at once)
// into a single fetch + native-menu rebuild.
export function scheduleTrayRebuild(): void {
  if (rebuildTimer) clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => {
    rebuildTimer = null;
    void rebuildTrayMenu();
  }, 400);
}

export async function createTray(): Promise<void> {
  let icon = nativeImage.createFromPath(
    join(__dirname, '..', 'build', 'tray.png'),
  );

  if (!icon.isEmpty()) {
    if (process.platform === 'darwin') {
      // macOS menu-bar icons are small and monochrome. Resizing to ~18px and
      // marking the image as a template lets the OS recolour it for the
      // light/dark menu bar (the logo's alpha channel becomes the mask).
      icon = icon.resize({ width: 18, height: 18 });
      icon.setTemplateImage(true);
    } else {
      // Windows/Linux trays want a small crisp icon (16px @1x).
      icon = icon.resize({ width: 16, height: 16 });
    }
  }

  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('BuildPilot');

  // Left-click toggles the window (Windows/Linux). On macOS, setting a context
  // menu makes any click open the menu, so the window is reached via the
  // menu's "Open BuildPilot" item instead.
  tray.on('click', () => toggleWindow());

  // Synchronous placeholder — the real project list is applied by main once
  // the server is up (rebuildTrayMenu), avoiding a fetch against a server that
  // hasn't started yet.
  tray.setContextMenu(buildMenu([], '(loading…)'));
}

export function destroyTray(): void {
  if (rebuildTimer) clearTimeout(rebuildTimer);
  rebuildTimer = null;
  tray?.destroy();
  tray = null;
}
