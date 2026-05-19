import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StepContext } from '../engine';
import { getDb, initDb } from '../../store/db';
import { createPipeline } from '../../store/pipelines';
import { createBuild } from '../../store/builds';
import { createProject } from '../../store/projects';
import { suppressForMatrixSummary } from './_matrixGuard';

// Cluster 11.C — the helper that lets every notify step opt-out when it
// runs inside a matrix child whose parent pipeline has matrixSummary on.

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'matrix-guard-'));
  initDb(join(dir, 'db.sqlite'));
});

afterEach(() => {
  // Close DB before removing temp dir, otherwise Windows holds the WAL
  // mmap'd file and rmSync fails with EPERM.
  getDb().close();
  rmSync(dir, { recursive: true, force: true });
});

function ctx(build: ReturnType<typeof createBuild>): StepContext {
  return {
    build,
    nodeId: 'test-node',
    project: { id: build.projectId } as never,
    log: () => undefined,
    attachProcess: () => undefined,
  };
}

describe('suppressForMatrixSummary', () => {
  it('returns false for a non-matrix build', () => {
    const proj = createProject({
      name: 'p1',
      path: '/tmp/p1',
      defaultBranch: 'main',
    });
    const pipeline = createPipeline({
      projectId: proj.id,
      name: 'flat',
      watch: { branch: 'main', intervalSec: 30, autoTrigger: 'off' },
      nodes: [],
      edges: [],
    });
    const build = createBuild({
      pipelineId: pipeline.id,
      projectId: proj.id,
      triggerSha: 'sha',
      triggerBranch: 'main',
      laneId: 'default',
    });
    expect(suppressForMatrixSummary(ctx(build))).toBe(false);
  });

  it('returns true for a matrix child when matrixSummary defaults on', () => {
    const proj = createProject({
      name: 'p2',
      path: '/tmp/p2',
      defaultBranch: 'main',
    });
    const pipeline = createPipeline({
      projectId: proj.id,
      name: 'with matrix',
      watch: { branch: 'main', intervalSec: 30, autoTrigger: 'off' },
      nodes: [],
      edges: [],
      matrix: { axes: { x: ['1', '2'] } },
    });
    const parent = createBuild({
      pipelineId: pipeline.id,
      projectId: proj.id,
      triggerSha: 'sha',
      triggerBranch: 'main',
      laneId: 'default',
    });
    const child = createBuild({
      pipelineId: pipeline.id,
      projectId: proj.id,
      triggerSha: 'sha',
      triggerBranch: 'main',
      laneId: 'default',
      parentBuildId: parent.id,
      matrixValues: { x: '1' },
      matrixLabel: 'x=1',
    });
    expect(suppressForMatrixSummary(ctx(child))).toBe(true);
  });

  it('returns false for a matrix child when matrixSummary is explicitly off', () => {
    const proj = createProject({
      name: 'p3',
      path: '/tmp/p3',
      defaultBranch: 'main',
    });
    const pipeline = createPipeline({
      projectId: proj.id,
      name: 'with matrix, per-cell notify',
      watch: {
        branch: 'main',
        intervalSec: 30,
        autoTrigger: 'off',
        matrixSummary: false,
      },
      nodes: [],
      edges: [],
      matrix: { axes: { x: ['1', '2'] } },
    });
    const parent = createBuild({
      pipelineId: pipeline.id,
      projectId: proj.id,
      triggerSha: 'sha',
      triggerBranch: 'main',
      laneId: 'default',
    });
    const child = createBuild({
      pipelineId: pipeline.id,
      projectId: proj.id,
      triggerSha: 'sha',
      triggerBranch: 'main',
      laneId: 'default',
      parentBuildId: parent.id,
      matrixValues: { x: '1' },
      matrixLabel: 'x=1',
    });
    expect(suppressForMatrixSummary(ctx(child))).toBe(false);
  });
});
