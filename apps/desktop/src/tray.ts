import { app, Menu, Tray, nativeImage, shell, type MenuItemConstructorOptions } from 'electron';
import { join } from 'node:path';
import { fetchProjects } from './api';
import { BASE_URL } from './config';
import { isLaunchAtLogin, setLaunchAtLogin } from './state';
import { openInBrowser, showWindow, toggleWindow } from './window';

let tray: Tray | null = null;

async function postAction(path: string): Promise<void> {
  try {
    await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
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

// Rebuild and apply the context menu. Called on startup and whenever the
// project set changes (project add/remove events) so the shortcuts stay live.
export async function rebuildTrayMenu(): Promise<void> {
  if (!tray) return;
  const projects = await fetchProjects();

  const projectItems: MenuItemConstructorOptions[] =
    projects.length > 0
      ? projects.map((p) => projectSubmenu(p))
      : [{ label: '(proje yok)', enabled: false }];

  const menu = Menu.buildFromTemplate([
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

  tray.setContextMenu(menu);
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

  await rebuildTrayMenu();
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}
