import { test, expect, type Page } from '@playwright/test';
import { startStack, type RunningStack } from '../fixtures/server';
import { seedDemoProject } from '../fixtures/seed';

// Visual regression suite. Each test seeds a deterministic stack, navigates
// to a stable page, and asserts the rendered DOM matches its committed
// baseline under e2e/screenshots/.
//
// Regenerate baselines (only after deliberate UI changes!):
//   pnpm test:visreg -- --update-snapshots
//
// Linux containers and macOS browsers render text antialiasing slightly
// differently, so the global config tolerates a 0.1% pixel-ratio drift
// (see e2e/playwright.config.ts). Baselines must be generated on the same
// OS family as the CI runner — keep all updates on Linux.

let stack: RunningStack;

test.beforeAll(async () => {
  stack = await startStack();
  // Seed one project + pipeline so the dashboard isn't an empty shell.
  await seedDemoProject(stack.apiUrl, 'Demo Project');
});

test.afterAll(async () => {
  await stack?.shutdown();
});

// Dismiss the auto-opening changelog drawer + suppress live time strings.
// Without this every screenshot would shift by "5 seconds ago" on every
// rerun, breaking diff stability.
async function stabilisePage(page: Page): Promise<void> {
  // Pin localStorage so the changelog drawer + first-run hints stay closed
  // and the theme stays dark (the default).
  await page.addInitScript(() => {
    try {
      // Mark every shipped changelog entry as seen.
      localStorage.setItem(
        'buildpilot.changelogSeen',
        JSON.stringify({ version: '99.99.99' }),
      );
      localStorage.setItem('buildpilot.theme', 'dark');
    } catch {
      /* noop */
    }
  });
}

// Mask elements whose content varies between runs (timestamps, durations,
// commit shas). Playwright blanks the masked rect with a solid colour in
// the snapshot, so a different value doesn't produce a diff.
const MASKABLE = [
  'time',                  // <time> tags everywhere
  '[data-volatile]',       // explicit opt-in
  '.font-mono',            // commit SHAs / build ids
];

// `networkidle` never settles for the dashboard (SSE keeps a persistent
// connection open). Instead, wait for the DOM to look quiescent: heading
// present + a short post-paint pause for transient effects to flush.
async function waitForDashboardSettled(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  // Wait for at least one heading or breadcrumb to render.
  await page.waitForSelector('main, [role="dialog"]', { timeout: 15_000 });
  // Pin animations off + give the renderer one frame to flush.
  await page.evaluate(
    () =>
      new Promise<void>((res) =>
        requestAnimationFrame(() => requestAnimationFrame(() => res())),
      ),
  );
}

async function snapshot(page: Page, name: string): Promise<void> {
  await expect(page).toHaveScreenshot(name, {
    fullPage: true,
    mask: MASKABLE.map((sel) => page.locator(sel)),
    animations: 'disabled',
    // The CSS `caret-color: transparent` + animation freeze guarantees no
    // blinking caret or in-flight transitions sneak into the diff.
    caret: 'hide',
  });
}

test.beforeEach(async ({ page }) => {
  await stabilisePage(page);
});

test('home dashboard', async ({ page }) => {
  await page.goto(`${stack.webUrl}/`);
  await waitForDashboardSettled(page);
  await snapshot(page, 'home-dashboard.png');
});

test('projects list', async ({ page }) => {
  await page.goto(`${stack.webUrl}/projects`);
  await waitForDashboardSettled(page);
  await snapshot(page, 'projects-list.png');
});

test('builds list', async ({ page }) => {
  await page.goto(`${stack.webUrl}/builds`);
  await waitForDashboardSettled(page);
  await snapshot(page, 'builds-list.png');
});

test('settings page', async ({ page }) => {
  await page.goto(`${stack.webUrl}/settings`);
  await waitForDashboardSettled(page);
  await snapshot(page, 'settings.png');
});

test('hosts page', async ({ page }) => {
  await page.goto(`${stack.webUrl}/hosts`);
  await waitForDashboardSettled(page);
  await snapshot(page, 'hosts.png');
});

test('pipeline editor with demo pipeline', async ({ page }) => {
  // Fetch the first pipeline so we can navigate straight to its editor.
  const pipelines = await page.request
    .get(`${stack.apiUrl}/api/pipelines`)
    .then((r) => r.json() as Promise<Array<{ id: string }>>);
  expect(pipelines.length).toBeGreaterThan(0);
  await page.goto(`${stack.webUrl}/pipelines/${pipelines[0]!.id}`);
  await waitForDashboardSettled(page);
  // React Flow renders nodes asynchronously after layout — wait for at
  // least one node to be present before snapshotting.
  await page.waitForSelector('.react-flow__node', { timeout: 10_000 });
  await snapshot(page, 'pipeline-editor.png');
});
