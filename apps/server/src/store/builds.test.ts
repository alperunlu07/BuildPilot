import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDb, initDb } from './db';
import { createProject } from './projects';
import { createPipeline } from './pipelines';
import {
  createBuild,
  findPendingBuildForPipeline,
  getBuild,
  updateBuildStatus,
  updatePendingBuildTrigger,
} from './builds';

// WP4 (queue): coalesce primitives — findPendingBuildForPipeline and
// updatePendingBuildTrigger. These run pure-SQL with no scheduler involved,
// so the tests stay focused on row state without needing the coordinator.

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'bp-builds-'));
  initDb(join(tmp, 'db.sqlite'));
});

afterEach(() => {
  try {
    getDb().close();
  } catch {
    /* not initialised */
  }
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
});

function makeProjectAndPipeline() {
  const project = createProject({
    name: 'p',
    path: join(tmp, 'proj'),
    defaultBranch: 'main',
  });
  const pipeline = createPipeline({
    projectId: project.id,
    name: 'pipe',
    watch: { branch: 'main', intervalSec: 30, autoTrigger: 'off' },
    nodes: [],
    edges: [],
  });
  return { project, pipeline };
}

function seedBuild(pipelineId: string, projectId: string, opts: { sha?: string } = {}) {
  return createBuild({
    pipelineId,
    projectId,
    triggerSha: opts.sha ?? '',
    triggerBranch: 'main',
    laneId: 'default',
  });
}

describe('findPendingBuildForPipeline (WP4)', () => {
  it('returns null when no builds exist for the pipeline', () => {
    const { pipeline } = makeProjectAndPipeline();
    expect(findPendingBuildForPipeline(pipeline.id)).toBeNull();
  });

  it('returns the sole pending build', () => {
    const { pipeline, project } = makeProjectAndPipeline();
    const b = seedBuild(pipeline.id, project.id, { sha: 'aaa' });
    const found = findPendingBuildForPipeline(pipeline.id);
    expect(found?.id).toBe(b.id);
    expect(found?.triggerSha).toBe('aaa');
  });

  it('ignores running builds and returns only the pending one', () => {
    const { pipeline, project } = makeProjectAndPipeline();
    const running = seedBuild(pipeline.id, project.id, { sha: 'aaa' });
    updateBuildStatus(running.id, 'running');
    const pending = seedBuild(pipeline.id, project.id, { sha: 'bbb' });

    const found = findPendingBuildForPipeline(pipeline.id);
    expect(found?.id).toBe(pending.id);
  });

  it('returns null when only finished builds exist (no pending)', () => {
    const { pipeline, project } = makeProjectAndPipeline();
    const b = seedBuild(pipeline.id, project.id);
    updateBuildStatus(b.id, 'success');
    expect(findPendingBuildForPipeline(pipeline.id)).toBeNull();
  });

  it('returns the most-recently-created pending when two exist (defensive)', async () => {
    // In normal flow WP4 prevents two pending rows from coexisting, but the
    // function should still pick a sensible row if a legacy / racy code path
    // ever inserts a duplicate.
    const { pipeline, project } = makeProjectAndPipeline();
    const older = seedBuild(pipeline.id, project.id, { sha: 'older' });
    // Force a wall-clock gap so started_at differs deterministically.
    await new Promise((r) => setTimeout(r, 5));
    const newer = seedBuild(pipeline.id, project.id, { sha: 'newer' });

    const found = findPendingBuildForPipeline(pipeline.id);
    expect(found?.id).toBe(newer.id);
    // Sanity: older still exists, just not picked.
    expect(getBuild(older.id)).not.toBeNull();
  });

  it('scopes to the requested pipeline only', () => {
    const { project, pipeline } = makeProjectAndPipeline();
    const otherPipeline = createPipeline({
      projectId: project.id,
      name: 'other',
      watch: { branch: 'main', intervalSec: 30, autoTrigger: 'off' },
      nodes: [],
      edges: [],
    });
    seedBuild(otherPipeline.id, project.id, { sha: 'xxx' });
    expect(findPendingBuildForPipeline(pipeline.id)).toBeNull();
  });
});

describe('updatePendingBuildTrigger (WP4)', () => {
  it('updates sha + branch + started_at when row is still pending', async () => {
    const { pipeline, project } = makeProjectAndPipeline();
    const original = seedBuild(pipeline.id, project.id, { sha: 'old' });
    const originalStartedAt = original.startedAt;
    await new Promise((r) => setTimeout(r, 5));

    const updated = updatePendingBuildTrigger(original.id, {
      triggerSha: 'new',
      triggerBranch: 'feature',
    });
    expect(updated).not.toBeNull();
    expect(updated?.id).toBe(original.id);
    expect(updated?.triggerSha).toBe('new');
    expect(updated?.triggerBranch).toBe('feature');
    expect(updated?.status).toBe('pending');
    expect(updated?.startedAt).toBeGreaterThan(originalStartedAt);
  });

  it('returns null and does NOT update when row is already running (race)', () => {
    const { pipeline, project } = makeProjectAndPipeline();
    const b = seedBuild(pipeline.id, project.id, { sha: 'old' });
    updateBuildStatus(b.id, 'running');

    const result = updatePendingBuildTrigger(b.id, {
      triggerSha: 'new',
      triggerBranch: 'feature',
    });
    expect(result).toBeNull();
    // Row must remain untouched — old sha + branch preserved.
    const fresh = getBuild(b.id);
    expect(fresh?.triggerSha).toBe('old');
    expect(fresh?.triggerBranch).toBe('main');
    expect(fresh?.status).toBe('running');
  });

  it('returns null for a non-existent build id', () => {
    expect(
      updatePendingBuildTrigger('does-not-exist', {
        triggerSha: 'x',
        triggerBranch: 'y',
      }),
    ).toBeNull();
  });
});
