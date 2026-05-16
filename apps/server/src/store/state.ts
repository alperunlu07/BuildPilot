import { getDb } from './db';

export function getLastSeenSha(projectId: string, branch: string): string | null {
  const row = getDb()
    .prepare('SELECT last_seen_sha FROM poller_state WHERE project_id = ? AND branch = ?')
    .get(projectId, branch) as { last_seen_sha: string } | undefined;
  return row?.last_seen_sha ?? null;
}

export function setLastSeenSha(projectId: string, branch: string, sha: string): void {
  getDb()
    .prepare(
      `INSERT INTO poller_state (project_id, branch, last_seen_sha, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(project_id, branch) DO UPDATE SET
         last_seen_sha = excluded.last_seen_sha,
         updated_at = excluded.updated_at`,
    )
    .run(projectId, branch, sha, Date.now());
}

// Generic key/value scratchpad backing tag-pattern + cron tracking. Each
// caller picks an opaque key namespace; the value is an arbitrary string
// (typically a SHA or a unix timestamp). Phase 4 Cluster A.
export function getPollerKv(key: string): string | null {
  const row = getDb()
    .prepare('SELECT value FROM poller_kv WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setPollerKv(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO poller_kv (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
    )
    .run(key, value, Date.now());
}
