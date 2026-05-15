import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDb, initDb } from './db';
import { createBuild, updateBuildStatus } from './builds';
import { appendBuildLogEntry } from './buildLogs';
import { insertBuildArtifact } from './buildArtifacts';
import { pruneOldBuilds } from './retention';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'bp-retention-'));
  initDb(join(tmp, 'db.sqlite'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

// Reach into the DB to retro-date a build so we can simulate "old enough
// to prune" without sleeping. updateBuildStatus only stamps finished_at —
// we have to set started_at directly too.
function backdate(buildId: string, ms: number): void {
  getDb()
    .prepare('UPDATE builds SET started_at = ?, finished_at = ? WHERE id = ?')
    .run(ms, ms, buildId);
}

describe('pruneOldBuilds', () => {
  it('is a no-op when retentionDays <= 0', () => {
    const b = createBuild({
      pipelineId: 'p1',
      projectId: 'pj1',
      triggerSha: '',
      triggerBranch: 'main',
    });
    updateBuildStatus(b.id, 'success');
    expect(pruneOldBuilds(0).builds).toBe(0);
    expect(pruneOldBuilds(-1).builds).toBe(0);
  });

  it('prunes builds older than the cutoff and cascades log + artifact rows', () => {
    const old = createBuild({
      pipelineId: 'p1',
      projectId: 'pj1',
      triggerSha: '',
      triggerBranch: 'main',
    });
    updateBuildStatus(old.id, 'success');
    appendBuildLogEntry({
      buildId: old.id,
      ts: Date.now(),
      level: 'info',
      nodeId: null,
      stepType: null,
      message: 'old',
    });
    insertBuildArtifact({ buildId: old.id, path: '/tmp/x', size: 1, mtime: 0 });
    // Retro-date 45d back.
    backdate(old.id, Date.now() - 45 * 24 * 60 * 60 * 1000);

    const fresh = createBuild({
      pipelineId: 'p1',
      projectId: 'pj1',
      triggerSha: '',
      triggerBranch: 'main',
    });
    updateBuildStatus(fresh.id, 'success');

    const stats = pruneOldBuilds(30);
    expect(stats.builds).toBe(1);
    expect(stats.logEntries).toBe(1);
    expect(stats.artifacts).toBe(1);
  });

  it('refuses to prune still-running builds even past the cutoff', () => {
    const b = createBuild({
      pipelineId: 'p1',
      projectId: 'pj1',
      triggerSha: '',
      triggerBranch: 'main',
    });
    // Leave status='pending'. Retro-date 100d back anyway.
    backdate(b.id, Date.now() - 100 * 24 * 60 * 60 * 1000);
    expect(pruneOldBuilds(30).builds).toBe(0);
  });
});
