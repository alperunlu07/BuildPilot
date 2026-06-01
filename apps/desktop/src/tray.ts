import { app, Menu, Tray, nativeImage, shell, type MenuItemConstructorOptions } from 'electron';
import { join } from 'node:path';
import { fetchProjects } from './api';
import { BASE_URL, authHeaders } from './config';
import { isLaunchAtLogin, setLaunchAtLogin } from './state';
import { openInBrowser, showWindow, toggleWindow } from './window';

let tray: Tray | null = null;

async function postAction(path: string): Promise<void> {
  try {
    await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: authHeaders(),
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
      { label: 'Panelde Aç', click: () => showWindow('/projects') },
      { label: 'Tarayıcıda Aç', click: () => openInBrowser('/projects') },
      { type: 'separator' },
      {
        label: 'Proje Klasörünü Aç',
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
      : [{ label: '(proje yok)', enabled: false }];

  return Menu.buildFromTemplate([
    { label: 'BuildPilot’u Aç', click: () => showWindow('/') },
    { label: 'Tarayıcıda Aç', click: () => openInBrowser('/') },
    { type: 'separator' },
    { label: 'Projeler', submenu: projectItems },
    { type: 'separator' },
    { label: 'Derlemeler', click: () => showWindow('/builds') },
    { label: 'Kuyruk', click: () => showWindow('/queue') },
    { label: 'Ayarlar', click: () => showWindow('/settings') },
    { type: 'separator' },
    {
      label: 'Açılışta Başlat',
      type: 'checkbox',
      checked: isLaunchAtLogin(),
      click: (item) => setLaunchAtLogin(item.checked),
    },
    { type: 'separator' },
    { label: 'Çıkış', role: 'quit' },
  ]);
}

// Fetch the current project set and apply the menu. Called once after the
// server is up and thereafter (debounced) on project add/remove events.
export async function rebuildTrayMenu(): Promise<void> {
  if (!tray) return;
  const projects = await fetchProjects();
  if (tray) tray.setContextMenu(buildMenu(projects));
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
  // menu's "BuildPilot'u Aç" item instead.
  tray.on('click', () => toggleWindow());

  // Synchronous placeholder — the real project list is applied by main once
  // the server is up (rebuildTrayMenu), avoiding a fetch against a server that
  // hasn't started yet.
  tray.setContextMenu(buildMenu([], '(yükleniyor…)'));
}

export function destroyTray(): void {
  if (rebuildTimer) clearTimeout(rebuildTimer);
  rebuildTimer = null;
  tray?.destroy();
  tray = null;
}
