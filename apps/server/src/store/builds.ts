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
  // Cluster 11.C — matrix fan-out columns. All nullable so non-matrix
  // (legacy) rows round-trip cleanly through the additive migration in
  // db.ts.
  parent_build_id: string | null;
  matrix_values_json: string | null;
  matrix_label: string | null;
}

function rowToBuild(row: BuildRow): Build {
  let matrixValues: Record<string, string> | null = null;
  if (row.matrix_values_json) {
    try {
      const parsed = JSON.parse(row.matrix_values_json) as Record<string, string>;
      if (parsed && typeof parsed === 'object') matrixValues = parsed;
    } catch {
      /* malformed JSON — treat as no matrix data */
    }
  }
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
    parentBuildId: row.parent_build_id,
    matrixValues,
    matrixLabel: row.matrix_label,
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
  // Cluster 11.C — matrix fan-out. Pass parentBuildId + matrixValues +
  // matrixLabel together when creating a child build; pass none for
  // ordinary builds and parent rows.
  parentBuildId?: string | null;
  matrixValues?: Record<string, string> | null;
  matrixLabel?: string | null;
}

export function createBuild(input: BuildInput): Build {
  const id = randomUUID();
  const startedAt = Date.now();
  const status: BuildStatus = 'pending';
  const parentBuildId = input.parentBuildId ?? null;
  const matrixValues = input.matrixValues ?? null;
  const matrixLabel = input.matrixLabel ?? null;
  const matrixValuesJson = matrixValues ? JSON.stringify(matrixValues) : null;
  getDb()
    .prepare(
      `INSERT INTO builds
       (id, pipeline_id, project_id, trigger_sha, trigger_branch, status,
        started_at, finished_at, log,
        parent_build_id, matrix_values_json, matrix_label)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, '', ?, ?, ?)`,
    )
    .run(
      id,
      input.pipelineId,
      input.projectId,
      input.triggerSha,
      input.triggerBranch,
      status,
      startedAt,
      parentBuildId,
      matrixValuesJson,
      matrixLabel,
    );
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
    parentBuildId,
    matrixValues,
    matrixLabel,
  };
}

// Cluster 11.C — fetch child builds belonging to a parent matrix build,
// in insertion order so the grid layout is stable across reloads.
export function listChildBuilds(parentBuildId: string): Build[] {
  const rows = getDb()
    .prepare(
      'SELECT * FROM builds WHERE parent_build_id = ? ORDER BY started_at ASC',
    )
    .all(parentBuildId) as BuildRow[];
  return rows.map(rowToBuild);
}

export function updateBuildStatus(id: string, status: BuildStatus): void {
  const finishedAt: number | null = ['success', 'failed', 'cancelled'].includes(status)
    ? Date.now()
    : null;
  getDb()
    .prepare('UPDATE builds SET status = ?, finished_at = ? WHERE id = ?')
    .run(status, finishedAt, id);
}

