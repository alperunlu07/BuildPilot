import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { QueueSnapshot } from '@buildpilot/shared-types';
import { getDb, initDb } from '../store/db';
import { createBuild, updateBuildStatus } from '../store/builds';
import { createLane } from '../store/lanes';
import { createPipeline } from '../store/pipelines';
import { createProject } from '../store/projects';
import { queueRoutes } from './queue';

let tmp: string;
let app: FastifyInstance;
let projectId: string;

async function buildApp(): Promise<FastifyInstance> {
  const a = Fastify({ logger: false });
  await queueRoutes(a);
  await a.ready();
  return a;
}

// Force a build's started_at to a specific timestamp. createBuild() always
// stamps Date.now(), so when a test needs an ordering older-than-newer we
// have to retro-date the row directly. Also lets us drive 'pending' rows
// from createBuild() (which always inserts 'pending') without ambiguous
// wall-clock skew.
function setStartedAt(buildId: string, ms: number): void {
  getDb()
    .prepare('UPDATE builds SET started_at = ? WHERE id = ?')
    .run(ms, buildId);
}

// Flip a build to 'running' without changing finished_at semantics
// (updateBuildStatus only stamps finished_at on terminal states).
function markRunning(buildId: string): void {
  getDb()
    .prepare("UPDATE builds SET status = 'running' WHERE id = ?")
    .run(buildId);
}

// Minimal pipeline payload — the queue route LEFT JOINs pipelines purely
// to read the live `priority` for pending sort, so the only field that
// actually matters here is `priority`. Everything else just satisfies NOT
// NULL constraints.
function makePipeline(laneId: string, priority: number): string {
  const pipe = createPipeline({
    projectId,
    name: `p-${priority}`,
    watch: { branch: 'main', intervalSec: 30, autoTrigger: 'off' },
    nodes: [],
    edges: [],
    laneId,
    priority,
  });
  return pipe.id;
}

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'bp-queue-api-'));
  initDb(join(tmp, 'db.sqlite'));
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

describe('GET /api/queue', () => {
  it('returns the default lane with empty running + pending arrays when no builds exist', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/queue' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as QueueSnapshot;
    expect(body.generatedAt).toBeTypeOf('number');
    // initDb seeds the 'default' lane, so the listing is never empty.
    expect(body.lanes.length).toBe(1);
    expect(body.lanes[0]!.lane.id).toBe('default');
    expect(body.lanes[0]!.running).toEqual([]);
    expect(body.lanes[0]!.pending).toEqual([]);
  });

  it('places a single pending and a single running build under the same lane', async () => {
    const pipelineId = makePipeline('default', 100);

    const running = createBuild({
      pipelineId,
      projectId,
      triggerSha: 'sha-running',
      triggerBranch: 'main',
      laneId: 'default',
    });
    markRunning(running.id);

    const pending = createBuild({
      pipelineId,
      projectId,
      triggerSha: 'sha-pending',
      triggerBranch: 'main',
      laneId: 'default',
    });

    const res = await app.inject({ method: 'GET', url: '/api/queue' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as QueueSnapshot;
    const def = body.lanes.find((l) => l.lane.id === 'default')!;
    expect(def.running.map((b) => b.id)).toEqual([running.id]);
    expect(def.pending.map((b) => b.id)).toEqual([pending.id]);
  });

  it('groups builds into their respective lanes (no cross-lane bleed)', async () => {
    const macLane = createLane({ name: 'mac', maxConcurrency: 1 });
    const pipeDefault = makePipeline('default', 100);
    const pipeMac = makePipeline(macLane.id, 100);

    const defPending = createBuild({
      pipelineId: pipeDefault,
      projectId,
      triggerSha: 'd1',
      triggerBranch: 'main',
      laneId: 'default',
    });
    const macPending = createBuild({
      pipelineId: pipeMac,
      projectId,
      triggerSha: 'm1',
      triggerBranch: 'main',
      laneId: macLane.id,
    });

    const res = await app.inject({ method: 'GET', url: '/api/queue' });
    const body = res.json() as QueueSnapshot;
    expect(body.lanes.length).toBe(2);

    const def = body.lanes.find((l) => l.lane.id === 'default')!;
    const mac = body.lanes.find((l) => l.lane.id === macLane.id)!;
    expect(def.pending.map((b) => b.id)).toEqual([defPending.id]);
    expect(mac.pending.map((b) => b.id)).toEqual([macPending.id]);

    // Lane order is name ASC — 'Default' (seed name) before 'mac'.
    expect(body.lanes.map((l) => l.lane.name)).toEqual(['Default', 'mac']);
  });

  it('orders pending by priority ASC then started_at ASC (FIFO within tie)', async () => {
    const pipeHi = makePipeline('default', 50);
    const pipeLoOld = makePipeline('default', 100);
    const pipeLoNew = makePipeline('default', 100);

    // Created in reverse arrival order intentionally — we'll retro-date them.
    const hi = createBuild({
      pipelineId: pipeHi,
      projectId,
      triggerSha: 'hi',
      triggerBranch: 'main',
      laneId: 'default',
    });
    const loOld = createBuild({
      pipelineId: pipeLoOld,
      projectId,
      triggerSha: 'lo-old',
      triggerBranch: 'main',
      laneId: 'default',
    });
    const loNew = createBuild({
      pipelineId: pipeLoNew,
      projectId,
      triggerSha: 'lo-new',
      triggerBranch: 'main',
      laneId: 'default',
    });

    // Force the timeline: loOld < loNew < hi in wall-clock order.
    // The route should still surface hi first (priority 50 < 100) and then
    // loOld before loNew (older started_at within the priority=100 tie).
    setStartedAt(loOld.id, 1_000);
    setStartedAt(loNew.id, 2_000);
    setStartedAt(hi.id, 3_000);

    const res = await app.inject({ method: 'GET', url: '/api/queue' });
    const body = res.json() as QueueSnapshot;
    const def = body.lanes.find((l) => l.lane.id === 'default')!;
    expect(def.pending.map((b) => b.triggerSha)).toEqual(['hi', 'lo-old', 'lo-new']);
  });
});
