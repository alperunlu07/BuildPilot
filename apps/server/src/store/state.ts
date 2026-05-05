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
