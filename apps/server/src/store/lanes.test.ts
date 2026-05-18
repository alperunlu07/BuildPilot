import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDb, initDb } from './db';
import {
  createLane,
  deleteLane,
  getLane,
  listLanes,
  updateLane,
} from './lanes';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'bp-lanes-'));
  initDb(join(tmp, 'db.sqlite'));
});

afterEach(() => {
  // On Windows, SQLite WAL files stay mmapped until the connection is
  // closed; rmSync would then fail with EPERM. Close the handle first.
  try {
    getDb().close();
  } catch {
    /* not initialised — fine */
  }
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* best-effort temp cleanup */
  }
});

describe('lanes store', () => {
  it('seeds the sentinel "default" lane on initDb', () => {
    const def = getLane('default');
    expect(def).not.toBeNull();
    expect(def?.id).toBe('default');
    expect(def?.name).toBe('Default');
    expect(def?.maxConcurrency).toBe(1);
  });

  it('createLane returns the new row and listLanes sorts by name ASC', () => {
    const build = createLane({ name: 'build', maxConcurrency: 2 });
    expect(build.id).toBeTruthy();
    expect(build.name).toBe('build');
    expect(build.maxConcurrency).toBe(2);

    // Also create an out-of-order entry so we can verify sorting.
    createLane({ name: 'archive', maxConcurrency: 1 });

    const names = listLanes().map((l) => l.name);
    // Default lane is seeded with name 'Default'. Sort is binary ASC, so
    // capital 'D' (0x44) precedes lowercase letters (0x61+).
    expect(names).toEqual(['Default', 'archive', 'build']);
  });

  it('throws on duplicate lane name', () => {
    createLane({ name: 'build', maxConcurrency: 2 });
    expect(() => createLane({ name: 'build', maxConcurrency: 4 })).toThrow();
  });

  it('updateLane changes the name', () => {
    const lane = createLane({ name: 'build', maxConcurrency: 2 });
    const updated = updateLane(lane.id, { name: 'mac-build' });
    expect(updated?.name).toBe('mac-build');
    expect(updated?.maxConcurrency).toBe(2);
    expect(getLane(lane.id)?.name).toBe('mac-build');
  });

  it('deleteLane removes a non-default lane', () => {
    const lane = createLane({ name: 'build', maxConcurrency: 2 });
    expect(deleteLane(lane.id)).toBe(true);
    expect(getLane(lane.id)).toBeNull();
    // Sentinel survives — the store itself doesn't enforce "default is
    // sacred"; that's the API layer's job. We only verify the row is still
    // there because no one asked it to be deleted.
    expect(getLane('default')).not.toBeNull();
  });
});
