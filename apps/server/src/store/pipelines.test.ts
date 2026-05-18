import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDb, initDb } from './db';
import { createPipeline, getPipeline, updatePipeline } from './pipelines';
import { createLane } from './lanes';
import { createProject } from './projects';

let tmp: string;
let projectId: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'bp-pipelines-'));
  initDb(join(tmp, 'db.sqlite'));
  // The pipelines table has an FK on project_id → projects(id) with PRAGMA
  // foreign_keys ON, so a real project row needs to exist before we can
  // insert a pipeline.
  const proj = createProject({
    name: 'p',
    path: join(tmp, 'proj'),
    defaultBranch: 'main',
  });
  projectId = proj.id;
});

afterEach(() => {
  // Windows holds the WAL mmap until the connection is closed, so close
  // before rm to avoid EPERM.
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

// Minimal valid pipeline payload — projects FK is enforced at the API
// layer, not in the pipelines store, so a synthetic projectId is fine here.
function baseInput() {
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
  };
}

describe('pipelines store — WP2 lane + priority', () => {
  it('createPipeline defaults laneId="default" and priority=100', () => {
    const p = createPipeline(baseInput());
    expect(p.laneId).toBe('default');
    expect(p.priority).toBe(100);

    // Round-trips through the DB as well — guards against rowToPipeline
    // forgetting to read the new columns.
    const fetched = getPipeline(p.id);
    expect(fetched?.laneId).toBe('default');
    expect(fetched?.priority).toBe(100);
  });

  it('createPipeline honours an explicit laneId + priority', () => {
    const lane = createLane({ name: 'mac', maxConcurrency: 2 });
    const p = createPipeline({
      ...baseInput(),
      laneId: lane.id,
      priority: 5,
    });
    expect(p.laneId).toBe(lane.id);
    expect(p.priority).toBe(5);
  });

  it('updatePipeline can repin laneId and bump priority', () => {
    const lane = createLane({ name: 'archive', maxConcurrency: 1 });
    const p = createPipeline(baseInput());

    const updated = updatePipeline(p.id, { laneId: lane.id, priority: 10 });
    expect(updated?.laneId).toBe(lane.id);
    expect(updated?.priority).toBe(10);

    // Persisted across read.
    const fetched = getPipeline(p.id);
    expect(fetched?.laneId).toBe(lane.id);
    expect(fetched?.priority).toBe(10);
  });

  it('updatePipeline leaves laneId/priority untouched when not provided', () => {
    const lane = createLane({ name: 'gpu', maxConcurrency: 4 });
    const p = createPipeline({
      ...baseInput(),
      laneId: lane.id,
      priority: 7,
    });
    const updated = updatePipeline(p.id, { name: 'renamed' });
    expect(updated?.laneId).toBe(lane.id);
    expect(updated?.priority).toBe(7);
    expect(updated?.name).toBe('renamed');
  });
});
