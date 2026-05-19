import { test, expect } from '@playwright/test';
import { startStack, type RunningStack } from '../fixtures/server';
import { createTempGitRepo } from '../fixtures/seed';

// End-to-end happy path:
//   1. spin up an isolated server + web dev server,
//   2. create a project on a freshly-init'd local git repo,
//   3. attach a pipeline with one `shell: echo hi` step,
//   4. trigger a build,
//   5. wait for the build to reach `success` status.
//
// We poll the REST API (rather than relying on SSE in jsdom) to avoid
// flakiness — the dashboard's update cadence is its own concern, exercised
// separately by the component unit tests.

let stack: RunningStack;

test.beforeAll(async () => {
  stack = await startStack();
});

test.afterAll(async () => {
  await stack?.shutdown();
});

test('add project → create pipeline → trigger build → success', async ({ page }) => {
  const repoPath = createTempGitRepo('happy-path');

  // ── 1. Create the project ──────────────────────────────────────────────
  const projectRes = await page.request.post(`${stack.apiUrl}/api/projects`, {
    data: { path: repoPath, name: 'Happy Path Project' },
  });
  expect(projectRes.ok()).toBe(true);
  const project = (await projectRes.json()) as { id: string };

  // ── 2. Create the pipeline (one `shell: echo hi` node) ─────────────────
  const pipelineRes = await page.request.post(`${stack.apiUrl}/api/pipelines`, {
    data: {
      projectId: project.id,
      name: 'Echo',
      watch: { branch: 'main', intervalSec: 60, autoTrigger: 'off' },
      nodes: [
        {
          id: 'echo-1',
          type: 'shell',
          position: { x: 100, y: 100 },
          data: { command: 'echo hi' },
        },
      ],
      edges: [],
    },
  });
  if (!pipelineRes.ok()) {
    throw new Error(
      `pipeline POST failed: ${pipelineRes.status()} ${await pipelineRes.text()}`,
    );
  }
  const pipeline = (await pipelineRes.json()) as { id: string };

  // ── 3. Trigger a build ─────────────────────────────────────────────────
  const buildRes = await page.request.post(`${stack.apiUrl}/api/builds`, {
    data: { pipelineId: pipeline.id },
  });
  expect(buildRes.ok()).toBe(true);
  const build = (await buildRes.json()) as { id: string; status: string };

  // ── 4. Poll for success ────────────────────────────────────────────────
  // The shell step is `echo hi` — sub-second. We give it 30s of headroom
  // for tsx startup + pipeline scheduling on a cold container.
  let finalStatus: string = build.status;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const r = await page.request.get(`${stack.apiUrl}/api/builds/${build.id}`);
    if (r.ok()) {
      const cur = (await r.json()) as { status: string };
      finalStatus = cur.status;
      if (finalStatus === 'success' || finalStatus === 'failed') break;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  expect(finalStatus).toBe('success');

  // ── 5. Open the dashboard and assert the build is visible in the list ──
  await page.goto(`${stack.webUrl}/builds`);
  // The first-visit changelog drawer auto-opens and covers the right side
  // of the screen — dismiss it if present so the builds table is reachable.
  const changelogClose = page.getByRole('button', { name: /^Close$/ });
  if (await changelogClose.isVisible().catch(() => false)) {
    await changelogClose.click();
  }
  // The Builds page renders each build as a link with an aria-label that
  // includes the project name, pipeline name, and status. This is the
  // single load-bearing signal that the full happy path worked end-to-end.
  await expect(
    page.getByRole('link', { name: /Happy Path Project.*Echo.*success/i }),
  ).toBeVisible({ timeout: 15_000 });
});
