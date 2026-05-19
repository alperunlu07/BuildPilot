import { defineConfig, devices } from '@playwright/test';
import { join } from 'node:path';

// Playwright transpiles this file as CommonJS (the root package.json has
// no "type": "module"), so __dirname is available natively. Avoid
// `import.meta` / fileURLToPath to keep that working.
const HERE = __dirname;

// Two projects:
//  - happy-path: spins up an isolated server + serves the built web app,
//    walks the dashboard end-to-end.
//  - visreg: same fixture, but only runs the visual regression suite. The
//    snapshot baselines are committed under e2e/screenshots/.
//
// Both share the same global setup (`fixtures/global-setup.ts`) which
// pre-builds the web bundle once before the worker forks off.
export default defineConfig({
  testDir: join(HERE, 'tests'),
  outputDir: join(HERE, 'test-results'),
  fullyParallel: false,
  // Single worker so the seed fixture's server-port allocation doesn't
  // collide between tests.
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      // 0.1% threshold absorbs subpixel anti-aliasing differences between
      // local Linux containers and CI runners. Snapshots themselves are
      // committed under e2e/screenshots/.
      maxDiffPixelRatio: 0.001,
      threshold: 0.2,
    },
  },
  snapshotDir: join(HERE, 'screenshots'),
  // Stable file layout: <test-file>/<name>-<project>.png so re-running on
  // a different OS doesn't silently dual-write baselines.
  snapshotPathTemplate: '{snapshotDir}/{testFilePath}/{arg}{ext}',
  use: {
    baseURL: 'http://127.0.0.1:51742',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    // Pin viewport + locale so screenshots stay deterministic on Linux CI.
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    timezoneId: 'UTC',
  },
  projects: [
    {
      name: 'happy-path',
      testMatch: /happy-path\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'visreg',
      testMatch: /visual-regression\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
