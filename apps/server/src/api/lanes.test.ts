import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDb, initDb } from '../store/db';
import { createLane } from '../store/lanes';
import { createPipeline } from '../store/pipelines';
import { createProject } from '../store/projects';
import { lanesRoutes } from './lanes';

let tmp: string;
let app: FastifyInstance;
let projectId: string;

async function buildApp(): Promise<FastifyInstance> {
  const a = Fastify({ logger: false });
  await lanesRoutes(a);
  await a.ready();
  return a;
}

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'bp-lanes-api-'));
  initDb(join(tmp, 'db.sqlite'));
  // pipelines.project_id is a real FK to projects.id with PRAGMA
  // foreign_keys ON, so we need an actual project row to pin a pipeline.
  const proj = createProject({
    name: 'p',
    path: join(tmp, 'proj'),
    defaultBranch: 'main',
  });
  projectId = proj.id;
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
  // Close DB after fastify so any in-flight handlers release their stmts.
  try {
    getDb().close();
  } catch {
    /* not initialised — fine */
  }
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
});

// Minimal pipeline payload, mirrors what the pipelines store accepts.
function pipelineInput(laneId: string) {
  return {
    projectId,
    name: 'p',
    watch: {
      branch: 'main',
      intervalSec: 30,
      autoTrigger: 'off' as const,
    },
    nodes: [],
    edges: [],
    laneId,
  };
}

describe('DELETE /api/lanes/:id — in-use guard', () => {
  it('returns 409 + pipelineCount when a pipeline is pinned to the lane', async () => {
    const lane = createLane({ name: 'mac', maxConcurrency: 2 });
    createPipeline(pipelineInput(lane.id));

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/lanes/${lane.id}`,
    });
    expect(res.statusCode).toBe(409);
    const body = res.json() as { error: string; pipelineCount: number };
    expect(body.error).toMatch(/in use/i);
    expect(body.pipelineCount).toBe(1);
  });

  it('deletes a non-default lane that no pipeline references', async () => {
    const lane = createLane({ name: 'mac', maxConcurrency: 2 });
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/lanes/${lane.id}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('refuses to delete the default lane even when nothing is pinned to it', async () => {
    // Sanity check: WP1's "cannot delete default" guard still holds after
    // WP2 adds the lane_id pragma probe.
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/lanes/default',
    });
    expect(res.statusCode).toBe(403);
  });
});
