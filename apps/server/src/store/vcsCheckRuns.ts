import type { CheckRunState, VcsProvider } from '@buildpilot/shared-types';
import { getDb } from './db';

// Cluster 11.E — bookkeeping for outbound check-run posts. Lets the engine
// "rerun" a build by updating the same external check-run row rather than
// stacking a new one.

interface VcsCheckRunRow {
  build_id: string;
  provider: string;
  ref: string;
  state: string;
  updated_at: number;
}

export interface VcsCheckRunRecord {
  buildId: string;
  provider: VcsProvider;
  // Provider-specific external id (GitHub check_run.id; GitLab + Gitea both
  // overwrite by SHA + context so the ref is just the context name).
  ref: string;
  state: CheckRunState;
  updatedAt: number;
}

export function getCheckRun(
  buildId: string,
  provider: VcsProvider,
): VcsCheckRunRecord | null {
  const row = getDb()
    .prepare(
      'SELECT * FROM vcs_check_runs WHERE build_id = ? AND provider = ?',
    )
    .get(buildId, provider) as VcsCheckRunRow | undefined;
  if (!row) return null;
  return {
    buildId: row.build_id,
    provider: row.provider as VcsProvider,
    ref: row.ref,
    state: row.state as CheckRunState,
    updatedAt: row.updated_at,
  };
}

export function upsertCheckRun(rec: VcsCheckRunRecord): void {
  getDb()
    .prepare(
      `INSERT INTO vcs_check_runs (build_id, provider, ref, state, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(build_id, provider) DO UPDATE SET
         ref = excluded.ref,
         state = excluded.state,
         updated_at = excluded.updated_at`,
    )
    .run(rec.buildId, rec.provider, rec.ref, rec.state, rec.updatedAt);
}
