import { randomUUID } from 'node:crypto';
import type { Build, BuildStatus } from '@buildpilot/shared-types';
import { getDb } from './db';

interface BuildRow {
  id: string;
  pipeline_id: string;
  project_id: string;
  trigger_sha: string;
  trigger_branch: string;
  status: string;
  started_at: number;
  finished_at: number | null;
  log: string;
}

function rowToBuild(row: BuildRow): Build {
  return {
    id: row.id,
    pipelineId: row.pipeline_id,
    projectId: row.project_id,
    triggerSha: row.trigger_sha,
    triggerBranch: row.trigger_branch,
    status: row.status as BuildStatus,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    log: row.log,
  };
}

export function listBuilds(opts: {
  projectId?: string;
  pipelineId?: string;
  limit?: number;
} = {}): Build[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  if (opts.projectId) {
    conditions.push('project_id = ?');
    params.push(opts.projectId);
  }
  if (opts.pipelineId) {
    conditions.push('pipeline_id = ?');
    params.push(opts.pipelineId);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = opts.limit ?? 50;
  const rows = getDb()
    .prepare(`SELECT * FROM builds ${where} ORDER BY started_at DESC LIMIT ?`)
    .all(...params, limit) as BuildRow[];
  return rows.map(rowToBuild);
}

export function getBuild(id: string): Build | null {
  const row = getDb().prepare('SELECT * FROM builds WHERE id = ?').get(id) as
    | BuildRow
    | undefined;
  return row ? rowToBuild(row) : null;
}

export interface BuildInput {
  pipelineId: string;
  projectId: string;
  triggerSha: string;
  triggerBranch: string;
}

export function createBuild(input: BuildInput): Build {
  const id = randomUUID();
  const startedAt = Date.now();
  const status: BuildStatus = 'pending';
  getDb()
    .prepare(
      `INSERT INTO builds
       (id, pipeline_id, project_id, trigger_sha, trigger_branch, status, started_at, finished_at, log)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, '')`,
    )
    .run(id, input.pipelineId, input.projectId, input.triggerSha, input.triggerBranch, status, startedAt);
  return {
    id,
    pipelineId: input.pipelineId,
    projectId: input.projectId,
    triggerSha: input.triggerSha,
    triggerBranch: input.triggerBranch,
    status,
    startedAt,
    finishedAt: null,
    log: '',
  };
}

export function updateBuildStatus(id: string, status: BuildStatus): void {
  const finishedAt: number | null = ['success', 'failed', 'cancelled'].includes(status)
    ? Date.now()
    : null;
  getDb()
    .prepare('UPDATE builds SET status = ?, finished_at = ? WHERE id = ?')
    .run(status, finishedAt, id);
}

