import {
  app,
  Menu,
  Notification,
  Tray,
  nativeImage,
  shell,
  type MenuItemConstructorOptions,
} from 'electron';
import { join } from 'node:path';
import type { Pipeline } from '@buildpilot/shared-types';
import {
  fetchPipelines,
  fetchProjects,
  fetchQueueCounts,
  triggerBuild,
} from './api';
import { getAuthHeaders, getBaseUrl } from './config';
import { isLaunchAtLogin, setLaunchAtLogin } from './state';
import { openInBrowser, showWindow, toggleWindow } from './window';

let tray: Tray | null = null;

const ICON = join(__dirname, '..', 'build', 'icon.png');

// Last-known server health, surfaced as a disabled status line at the top of
// the menu. null = not yet probed (cold start).
let serverHealthy: boolean | null = null;

// Caches so a health-/counts-only update can rebuild the native menu without
// re-fetching the whole project + pipeline set.
let lastProjects: ReadonlyArray<{ id: string; name: string; path: string }> = [];
let lastPipelines: ReadonlyArray<Pipeline> = [];
let lastCounts: { running: number; queued: number } = { running: 0, queued: 0 };
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

// Trigger a pipeline straight from the tray and surface a quick toast so the
// user gets immediate feedback (the eventual buildFinished toast follows via
// the SSE stream). Refresh the running/queued counts shortly after.
async function runPipeline(p: { id: string; name: string }): Promise<void> {
  const ok = await triggerBuild(p.id);
  if (Notification.isSupported()) {
    new Notification({
      title: ok ? 'Pipeline started ▶' : 'Couldn’t start pipeline',
      body: ok ? p.name : `${p.name} could not be started.`,
      icon: ICON,
      silent: false,
    }).show();
  }
  scheduleTrayStatusRefresh();
}

// Full restart of everything: quitting tears down the owned server child
// (before-quit → stopServer), then relaunch boots a fresh app which spawns a
// fresh server. Adopted servers (started elsewhere) are left running by design.
function restartApp(): void {
  app.relaunch();
  app.quit();
}

// Build the per-project submenu: panel/browser deep-links, the on-disk + git
// quick actions, then the project's pipelines — each runnable in one click.
function projectSubmenu(
  project: { id: string; name: string; path: string },
  pipelines: ReadonlyArray<Pipeline>,
): MenuItemConstructorOptions {
  const pipelineItems: MenuItemConstructorOptions[] =
    pipelines.length > 0
      ? pipelines.map((p) => ({
          label: `▶ ${p.name}`,
          click: () => void runPipeline(p),
        }))
      : [{ label: '(no pipelines)', enabled: false }];

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
      {
        label: 'Git Pull',
        click: () => void postAction(`/api/projects/${project.id}/pull`),
      },
      {
        label: 'Git Fetch',
        click: () => void postAction(`/api/projects/${project.id}/fetch`),
      },
      { type: 'separator' },
      { label: 'Run pipeline', enabled: false },
      ...pipelineItems,
    ],
  };
}

// Build the context menu from cached data. `placeholder` renders a disabled
// stand-in for the project group at cold start (before the server is up).
function buildMenu(placeholder?: string): Menu {
  const projectItems: MenuItemConstructorOptions[] = placeholder
    ? [{ label: placeholder, enabled: false }]
    : lastProjects.length > 0
      ? lastProjects.map((p) =>
          projectSubmenu(
            p,
            lastPipelines.filter((pl) => pl.projectId === p.id),
          ),
        )
      : [{ label: '(no projects)', enabled: false }];

  const items: MenuItemConstructorOptions[] = [
    { label: serverHealthLabel(), enabled: false },
  ];
  // Active build + queue counts — only shown when there's actually something
  // running or waiting (per request: "eğer varsa").
  if (lastCounts.running > 0 || lastCounts.queued > 0) {
    items.push({
      label: `${lastCounts.running} running · ${lastCounts.queued} queued`,
      enabled: false,
    });
  }

  items.push(
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
    { label: 'Restart BuildPilot', click: () => restartApp() },
    { type: 'separator' },
    { label: 'Quit', role: 'quit' },
  );

  return Menu.buildFromTemplate(items);
}

// Apply the menu from current caches and refresh the tooltip with live counts.
function applyMenu(): void {
  if (!tray) return;
  tray.setContextMenu(buildMenu(lastPlaceholder));
  const { running, queued } = lastCounts;
  tray.setToolTip(
    running > 0 || queued > 0
      ? `BuildPilot — ${running} running, ${queued} queued`
      : 'BuildPilot',
  );
}

// Fetch the full project + pipeline set and the queue counts, then apply the
// menu. Called once the server is up and (debounced) on project add/remove.
export async function rebuildTrayMenu(): Promise<void> {
  if (!tray) return;
  const [projects, pipelines, counts] = await Promise.all([
    fetchProjects(),
    fetchPipelines(),
    fetchQueueCounts(),
  ]);
  lastProjects = projects;
  lastPipelines = pipelines;
  lastCounts = counts;
  lastPlaceholder = undefined;
  applyMenu();
}

// Refresh only the running/queued counts (cheap) and re-apply the menu from
// cache — used when build events fire without the project set changing.
export async function refreshTrayStatus(): Promise<void> {
  if (!tray) return;
  lastCounts = await fetchQueueCounts();
  applyMenu();
}

// Update last-known server health and re-apply the menu in place (cached
// projects/pipelines/counts — no fetch). No-op if unchanged.
export function setServerHealth(healthy: boolean): void {
  if (serverHealthy === healthy) return;
  serverHealthy = healthy;
  applyMenu();
}

let rebuildTimer: ReturnType<typeof setTimeout> | null = null;

// Coalesce a burst of project events into a single fetch + native-menu rebuild.
export function scheduleTrayRebuild(): void {
  if (rebuildTimer) clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => {
    rebuildTimer = null;
    void rebuildTrayMenu();
  }, 400);
}

let statusTimer: ReturnType<typeof setTimeout> | null = null;

// Coalesce a burst of build events into a single queue-count refresh.
export function scheduleTrayStatusRefresh(): void {
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    statusTimer = null;
    void refreshTrayStatus();
  }, 600);
}

export async function createTray(): Promise<void> {
  // Windows/Linux show the full-colour rounded brand icon in the tray; macOS
  // uses a monochrome template (the OS recolours it for the light/dark menu
  // bar) — a colour tile there would look out of place and break templating.
  const iconPath =
    process.platform === 'darwin'
      ? join(__dirname, '..', 'build', 'trayTemplate.png')
      : join(__dirname, '..', 'build', 'tray.png');
  let icon = nativeImage.createFromPath(iconPath);

  if (!icon.isEmpty()) {
    if (process.platform === 'darwin') {
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

  // Synchronous placeholder — the real data is applied by main once the server
  // is up (rebuildTrayMenu), avoiding a fetch against a not-yet-started server.
  applyMenu();
}

export function destroyTray(): void {
  if (rebuildTimer) clearTimeout(rebuildTimer);
  if (statusTimer) clearTimeout(statusTimer);
  rebuildTimer = null;
  statusTimer = null;
  tray?.destroy();
  tray = null;
}
