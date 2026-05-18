import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Build, Pipeline, Project } from '@buildpilot/shared-types';
import { getDb, initDb } from '../store/db';
import { createLane } from '../store/lanes';
import { createProject } from '../store/projects';
import { createPipeline } from '../store/pipelines';
import { createBuild, getBuild, listBuilds, updateBuildStatus } from '../store/builds';
import {
  __resetCoordinatorState,
  __setPipelineRunner,
  enqueueBuild,
  initScheduler,
  startBuildForPipeline,
} from './coordinator';

// The runner under test is the coordinator's *scheduling* layer, not the
// real DAG engine. We swap runPipeline for a controllable stub so tests can
// drive build start/finish ordering deterministically and observe parallelism
// without spinning up actual step processes.

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'bp-coordinator-'));
  initDb(join(tmp, 'db.sqlite'));
  __resetCoordinatorState();
});

afterEach(() => {
  __resetCoordinatorState();
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

interface ControlledRun {
  buildId: string;
  // Resolve to let the runner "complete" — coordinator then frees the slot
  // and ticks the next pending build in the lane.
  finish: (status?: 'success' | 'failed' | 'cancelled') => void;
  // True between runPipeline-enter and finish() being called.
  startedAt: number;
}

interface Harness {
  starts: ControlledRun[];
  // Returns a snapshot of which buildIds are currently running (i.e. the
  // runner has been entered but finish() hasn't been called yet).
  running: () => string[];
  install: () => void;
}

function makeHarness(): Harness {
  const starts: ControlledRun[] = [];
  const live = new Set<string>();
  const install = () => {
    __setPipelineRunner((args) => {
      const buildId = args.build.id;
      live.add(buildId);
      return new Promise<void>((resolve) => {
        const run: ControlledRun = {
          buildId,
          startedAt: Date.now(),
          finish(status = 'success') {
            updateBuildStatus(buildId, status);
            live.delete(buildId);
            resolve();
          },
        };
        starts.push(run);
      });
    });
  };
  return {
    starts,
    running: () => [...live],
    install,
  };
}

function makeProject(): Project {
  return createProject({
    name: 'p',
    path: join(tmp, 'proj'),
    defaultBranch: 'main',
  });
}

function makePipeline(
  project: Project,
  opts: { laneId?: string; priority?: number; name?: string } = {},
): Pipeline {
  return createPipeline({
    projectId: project.id,
    name: opts.name ?? `pipe-${Math.random().toString(36).slice(2, 8)}`,
    watch: { branch: 'main', intervalSec: 30, autoTrigger: 'off' },
    nodes: [],
    edges: [],
    laneId: opts.laneId,
    priority: opts.priority,
  });
}

function enqueue(pipeline: Pipeline, project: Project): {
  build: Build;
  done: Promise<void>;
} {
  const build = createBuild({
    pipelineId: pipeline.id,
    projectId: project.id,
    triggerSha: '',
    triggerBranch: 'main',
    laneId: pipeline.laneId,
  });
  const done = enqueueBuild({ pipeline, project, build });
  return { build, done };
}

// Yield a microtask so the synchronous tick() chain has a chance to invoke
// the stub runner. The runner stub itself is synchronous through the point
// where it registers the ControlledRun, so a single setImmediate is enough.
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('coordinator — lane-aware scheduler (WP3)', () => {
  it('runs two pending builds on the default lane sequentially (maxConcurrency=1)', async () => {
    const harness = makeHarness();
    harness.install();

    const project = makeProject();
    const pipeline = makePipeline(project, { laneId: 'default' });

    const a = enqueue(pipeline, project);
    const b = enqueue(pipeline, project);

    await flush();
    // Default lane has maxConcurrency=1 — only one build is actually running.
    expect(harness.running()).toEqual([a.build.id]);
    expect(getBuild(a.build.id)?.status).toBe('running');
    expect(getBuild(b.build.id)?.status).toBe('pending');

    harness.starts[0]!.finish();
    await a.done;
    await flush();

    // First slot freed → second build picked up.
    expect(harness.running()).toEqual([b.build.id]);
    expect(getBuild(b.build.id)?.status).toBe('running');

    harness.starts[1]!.finish();
    await b.done;
    expect(getBuild(a.build.id)?.status).toBe('success');
    expect(getBuild(b.build.id)?.status).toBe('success');
  });

  it('runs two builds in parallel on a maxConcurrency=2 lane', async () => {
    const harness = makeHarness();
    harness.install();

    const lane = createLane({ name: 'parallel', maxConcurrency: 2 });
    const project = makeProject();
    const pipeline = makePipeline(project, { laneId: lane.id });

    const a = enqueue(pipeline, project);
    const b = enqueue(pipeline, project);

    await flush();
    // Both should be running concurrently — lane budget = 2.
    expect(new Set(harness.running())).toEqual(new Set([a.build.id, b.build.id]));
    expect(getBuild(a.build.id)?.status).toBe('running');
    expect(getBuild(b.build.id)?.status).toBe('running');

    harness.starts[0]!.finish();
    harness.starts[1]!.finish();
    await Promise.all([a.done, b.done]);
  });

  it('isolates lanes — builds on different lanes run in parallel even with maxConcurrency=1', async () => {
    const harness = makeHarness();
    harness.install();

    const laneA = createLane({ name: 'lane-a', maxConcurrency: 1 });
    const laneB = createLane({ name: 'lane-b', maxConcurrency: 1 });
    const project = makeProject();
    const pipeA = makePipeline(project, { laneId: laneA.id, name: 'pa' });
    const pipeB = makePipeline(project, { laneId: laneB.id, name: 'pb' });

    const a = enqueue(pipeA, project);
    const b = enqueue(pipeB, project);

    await flush();
    expect(new Set(harness.running())).toEqual(new Set([a.build.id, b.build.id]));

    harness.starts[0]!.finish();
    harness.starts[1]!.finish();
    await Promise.all([a.done, b.done]);
  });

  it('orders pending builds by (priority ASC, startedAt ASC) within a lane', async () => {
    const harness = makeHarness();
    harness.install();

    const project = makeProject();
    // Three pipelines on the default lane (maxConcurrency=1) with mixed
    // priorities: low (10) should win, then two ties at priority=50 broken
    // by FIFO insertion order.
    const lowPriority = makePipeline(project, { laneId: 'default', priority: 10, name: 'low' });
    const tieEarly = makePipeline(project, { laneId: 'default', priority: 50, name: 'tieEarly' });
    const tieLate = makePipeline(project, { laneId: 'default', priority: 50, name: 'tieLate' });
    // A blocker pipeline whose only purpose is to occupy the default lane's
    // single slot while we enqueue the three real builds below. Without it,
    // enqueueBuild's synchronous tick() would immediately start the first
    // build enqueued (FIFO), short-circuiting the priority sort we're
    // actually testing.
    const blockerPipe = makePipeline(project, { laneId: 'default', priority: 1, name: 'blocker' });

    const blockerRun = enqueue(blockerPipe, project);
    await flush();
    // Blocker should now hold the only slot on the default lane.
    expect(harness.running()).toEqual([blockerRun.build.id]);

    // Insert in non-priority order so the test actually exercises sorting.
    // tieEarly is enqueued before tieLate so within the tie it runs first.
    const tieEarlyRun = enqueue(tieEarly, project);
    // Spread enqueues across event-loop ticks so started_at is strictly
    // increasing — Date.now() can collide on a fast loop.
    await new Promise((r) => setTimeout(r, 5));
    const tieLateRun = enqueue(tieLate, project);
    await new Promise((r) => setTimeout(r, 5));
    const lowRun = enqueue(lowPriority, project);

    // Blocker still running, others all queued behind.
    expect(harness.running()).toEqual([blockerRun.build.id]);
    expect(getBuild(lowRun.build.id)?.status).toBe('pending');
    expect(getBuild(tieEarlyRun.build.id)?.status).toBe('pending');
    expect(getBuild(tieLateRun.build.id)?.status).toBe('pending');

    // Release the blocker. tick() should then pick by (priority ASC,
    // startedAt ASC) → low (priority=10) wins.
    harness.starts[0]!.finish();
    await blockerRun.done;
    await flush();
    expect(harness.running()).toEqual([lowRun.build.id]);

    harness.starts[1]!.finish();
    await lowRun.done;
    await flush();

    // Next: priority=50 tie → tieEarly (older started_at) wins.
    expect(harness.running()).toEqual([tieEarlyRun.build.id]);
    harness.starts[2]!.finish();
    await tieEarlyRun.done;
    await flush();

    // Last: tieLate.
    expect(harness.running()).toEqual([tieLateRun.build.id]);
    harness.starts[3]!.finish();
    await tieLateRun.done;
  });

  it('initScheduler fails any orphaned running rows and resumes pending rows', async () => {
    const harness = makeHarness();
    harness.install();

    const project = makeProject();
    const pipeline = makePipeline(project, { laneId: 'default' });

    // Simulate a previous-process state directly in SQL: one stuck 'running'
    // row and one freshly enqueued 'pending' row. We do NOT call
    // enqueueBuild here — initScheduler is what we're testing.
    const orphan = createBuild({
      pipelineId: pipeline.id,
      projectId: project.id,
      triggerSha: '',
      triggerBranch: 'main',
      laneId: 'default',
    });
    updateBuildStatus(orphan.id, 'running');

    const pendingBuild = createBuild({
      pipelineId: pipeline.id,
      projectId: project.id,
      triggerSha: '',
      triggerBranch: 'main',
      laneId: 'default',
    });
    // pendingBuild is left as 'pending' (createBuild's default).

    initScheduler();
    await flush();

    expect(getBuild(orphan.id)?.status).toBe('failed');
    // The orphan's pending sibling should now be running.
    expect(getBuild(pendingBuild.id)?.status).toBe('running');
    expect(harness.running()).toEqual([pendingBuild.id]);

    // Wrap up so afterEach doesn't leak a pending runner.
    harness.starts[0]!.finish();
  });
});

describe('coordinator — pending build coalesce (WP4)', () => {
  it('coalesces a second startBuildForPipeline onto the existing pending row', async () => {
    const harness = makeHarness();
    harness.install();

    const project = makeProject();
    // Use a custom lane with maxConcurrency=1 + a blocker pipeline of higher
    // priority so the pipeline under test stays pending while we trigger it
    // a second time. Without the blocker the synchronous tick() would start
    // the first build immediately and the second trigger would create a
    // brand-new pending row (not the scenario we want to cover).
    const lane = createLane({ name: 'coalesce', maxConcurrency: 1 });
    const blocker = makePipeline(project, { laneId: lane.id, priority: 1, name: 'blocker' });
    const target = makePipeline(project, { laneId: lane.id, priority: 50, name: 'target' });

    // Park the lane on the blocker.
    const blockerRun = enqueue(blocker, project);
    await flush();
    expect(harness.running()).toEqual([blockerRun.build.id]);

    // First trigger for `target` — startBuildForPipeline INSERTs a pending row.
    const first = await startBuildForPipeline(target.id, { triggerSha: 'sha-A', triggerBranch: 'main' });
    expect(first).not.toBeNull();
    expect(first!.triggerSha).toBe('sha-A');
    expect(first!.status).toBe('pending');

    // Second trigger before the first runs — coalesce must update in place,
    // not insert a second row. Result id stays the same; sha switches to B.
    const second = await startBuildForPipeline(target.id, { triggerSha: 'sha-B', triggerBranch: 'main' });
    expect(second).not.toBeNull();
    expect(second!.id).toBe(first!.id);
    expect(second!.triggerSha).toBe('sha-B');
    expect(second!.status).toBe('pending');

    // Only one pending row for the target pipeline should exist in the DB.
    const targetBuilds = listBuilds({ pipelineId: target.id });
    expect(targetBuilds.length).toBe(1);
    expect(targetBuilds[0]!.triggerSha).toBe('sha-B');

    // Drain the lane so afterEach doesn't leak.
    harness.starts[0]!.finish();
    await blockerRun.done;
    await flush();
    // The coalesced target build should now have started with the latest sha.
    expect(harness.running()).toEqual([first!.id]);
    expect(getBuild(first!.id)?.triggerSha).toBe('sha-B');
    harness.starts[1]!.finish();
  });

  it('coalesce only affects the pending row — a concurrent running build is untouched', async () => {
    const harness = makeHarness();
    harness.install();

    // maxConcurrency=1 + a blocker lets us hold exactly one running + one
    // pending build for the same pipeline, so coalesce only has the pending
    // row available to mutate. The running row's triggerSha must stay put.
    const lane = createLane({ name: 'one-slot', maxConcurrency: 1 });
    const project = makeProject();
    const blocker = makePipeline(project, { laneId: lane.id, priority: 1, name: 'blocker' });
    const target = makePipeline(project, { laneId: lane.id, priority: 50, name: 'target' });

    // Park lane on blocker.
    const blockerRun = enqueue(blocker, project);
    await flush();
    expect(harness.running()).toEqual([blockerRun.build.id]);

    // First target trigger → pending (blocker holds the slot).
    const pendingFirst = await startBuildForPipeline(target.id, {
      triggerSha: 'sha-A',
      triggerBranch: 'main',
    });
    expect(pendingFirst!.status).toBe('pending');

    // Release blocker so target promotes to running with sha-A.
    harness.starts[0]!.finish();
    await blockerRun.done;
    await flush();
    expect(harness.running()).toEqual([pendingFirst!.id]);
    const runningBuild = getBuild(pendingFirst!.id)!;
    expect(runningBuild.status).toBe('running');
    expect(runningBuild.triggerSha).toBe('sha-A');

    // Second target trigger arrives while the first is RUNNING → no pending
    // exists yet, so we INSERT a fresh pending row (not a coalesce).
    const pendingSecond = await startBuildForPipeline(target.id, {
      triggerSha: 'sha-B',
      triggerBranch: 'main',
    });
    expect(pendingSecond!.id).not.toBe(runningBuild.id);
    expect(pendingSecond!.status).toBe('pending');

    // Third target trigger — pending row exists → coalesce onto sha-C.
    // The running build's sha must remain sha-A.
    const coalesced = await startBuildForPipeline(target.id, {
      triggerSha: 'sha-C',
      triggerBranch: 'main',
    });
    expect(coalesced!.id).toBe(pendingSecond!.id);
    expect(coalesced!.triggerSha).toBe('sha-C');
    expect(getBuild(runningBuild.id)?.triggerSha).toBe('sha-A');
    // Total rows for this pipeline: 1 running + 1 coalesced pending = 2.
    expect(listBuilds({ pipelineId: target.id }).length).toBe(2);

    // Wrap up.
    harness.starts[1]!.finish();
    await flush();
    if (harness.starts[2]) harness.starts[2].finish();
  });

  it('coalesce falls back to insert when no pending exists (running pipeline)', async () => {
    const harness = makeHarness();
    harness.install();

    const project = makeProject();
    const pipeline = makePipeline(project, { laneId: 'default', name: 'p' });

    // First call — pipeline is idle, INSERT happens. Build immediately starts
    // (default lane budget = 1).
    const first = await startBuildForPipeline(pipeline.id, { triggerSha: 'sha-A', triggerBranch: 'main' });
    expect(first).not.toBeNull();
    await flush();
    expect(harness.running()).toEqual([first!.id]);

    // Finish it. No pending row exists between the finish and the next call.
    harness.starts[0]!.finish();
    await flush();
    expect(getBuild(first!.id)?.status).toBe('success');

    // Second call — should INSERT a fresh row, not silently update the
    // completed one.
    const second = await startBuildForPipeline(pipeline.id, { triggerSha: 'sha-B', triggerBranch: 'main' });
    expect(second).not.toBeNull();
    expect(second!.id).not.toBe(first!.id);
    await flush();
    expect(harness.running()).toEqual([second!.id]);

    harness.starts[1]!.finish();
  });
});
