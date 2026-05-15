import { getDb } from './db';

// Phase 4 Cluster D — build retention. Drop builds (+ their log entries
// and artifact rows) older than `retentionDays`. Returns a summary the
// caller can log. We don't delete the artifact files on disk — they may
// be referenced from outside BuildPilot — but the DB row going away means
// the download endpoint will return 410.
export interface PruneSummary {
  cutoffMs: number;
  builds: number;
  logEntries: number;
  artifacts: number;
}

export function pruneOldBuilds(retentionDays: number, now: number = Date.now()): PruneSummary {
  if (retentionDays <= 0) {
    return { cutoffMs: 0, builds: 0, logEntries: 0, artifacts: 0 };
  }
  const cutoffMs = now - retentionDays * 24 * 60 * 60 * 1000;
  const db = getDb();

  // Use a transaction so an intermediate failure doesn't leave orphan rows.
  const sweep = db.transaction(() => {
    // Identify candidate build ids first (only finished builds — never delete
    // a still-running build even if its started_at is past the cutoff).
    const buildIds = (
      db
        .prepare(
          `SELECT id FROM builds
             WHERE started_at < ?
               AND status IN ('success', 'failed', 'cancelled')`,
        )
        .all(cutoffMs) as Array<{ id: string }>
    ).map((r) => r.id);
    if (buildIds.length === 0) {
      return { logEntries: 0, artifacts: 0, builds: 0 };
    }
    // Chunk to keep parameter count safe (SQLite default cap is 32766).
    const CHUNK = 500;
    let logEntries = 0;
    let artifacts = 0;
    let builds = 0;
    for (let i = 0; i < buildIds.length; i += CHUNK) {
      const slice = buildIds.slice(i, i + CHUNK);
      const placeholders = slice.map(() => '?').join(',');
      const r1 = db
        .prepare(`DELETE FROM build_log_entries WHERE build_id IN (${placeholders})`)
        .run(...slice);
      logEntries += Number(r1.changes ?? 0);
      const r2 = db
        .prepare(`DELETE FROM build_artifacts WHERE build_id IN (${placeholders})`)
        .run(...slice);
      artifacts += Number(r2.changes ?? 0);
      const r3 = db
        .prepare(`DELETE FROM builds WHERE id IN (${placeholders})`)
        .run(...slice);
      builds += Number(r3.changes ?? 0);
    }
    return { logEntries, artifacts, builds };
  });

  const stats = sweep();
  return { cutoffMs, builds: stats.builds, logEntries: stats.logEntries, artifacts: stats.artifacts };
}
