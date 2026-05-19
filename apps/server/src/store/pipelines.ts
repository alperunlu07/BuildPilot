import { randomUUID } from 'node:crypto';
import type {
  Matrix,
  Pipeline,
  PipelineEdge,
  PipelineNode,
  PipelineWatch,
} from '@buildpilot/shared-types';
import { getDb } from './db';
import {
  decryptSecretsInObject,
  encryptSecretsInObject,
} from '../crypto/secrets';

function encryptNodes(nodes: PipelineNode[]): PipelineNode[] {
  return nodes.map((n) => ({ ...n, data: encryptSecretsInObject(n.data) }));
}

function decryptNodes(nodes: PipelineNode[]): PipelineNode[] {
  return nodes.map((n) => ({ ...n, data: decryptSecretsInObject(n.data) }));
}

interface PipelineRow {
  id: string;
  project_id: string;
  name: string;
  watch_branch: string;
  watch_interval_sec: number;
  auto_trigger: string;
  nodes_json: string;
  edges_json: string;
  created_at: number;
  updated_at: number;
  last_built_sha: string | null;
  telegram_approvals: number;
  // Phase 4 Cluster A — extra trigger fields. Nullable so existing rows
  // from before the migration round-trip cleanly.
  tag_pattern: string | null;
  cron_expr: string | null;
  path_filter: string | null;
  cancel_in_progress_on_new_commit: number | null;
  // Cluster 11.C — matrix declaration + summary-notification flag.
  matrix_json: string | null;
  matrix_summary: number | null;
  // Cluster 11.E — PR comment trigger settings.
  pr_commands: string | null;
  pr_command_authors: string | null;
}

function parseMatrix(raw: string | null): Matrix | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Matrix;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.axes || typeof parsed.axes !== 'object') return null;
    const axisNames = Object.keys(parsed.axes);
    if (axisNames.length === 0) return null;
    for (const k of axisNames) {
      const v = parsed.axes[k];
      if (!Array.isArray(v) || v.length === 0) return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function rowToPipeline(row: PipelineRow): Pipeline {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    watch: {
      branch: row.watch_branch,
      intervalSec: row.watch_interval_sec,
      autoTrigger: row.auto_trigger as PipelineWatch['autoTrigger'],
      telegramApprovals: row.telegram_approvals === 1,
      tagPattern: row.tag_pattern ?? undefined,
      cronExpr: row.cron_expr ?? undefined,
      pathFilter: row.path_filter ?? undefined,
      cancelInProgressOnNewCommit: row.cancel_in_progress_on_new_commit === 1,
      // Defaults to true when the column is NULL (legacy row) so existing
      // pipelines with a matrix get the rolled-up notification behavior
      // for free.
      matrixSummary: row.matrix_summary === null ? true : row.matrix_summary === 1,
      prCommands: row.pr_commands ?? undefined,
      prCommandAuthors: row.pr_command_authors ?? undefined,
    },
    nodes: decryptNodes(JSON.parse(row.nodes_json) as PipelineNode[]),
    edges: JSON.parse(row.edges_json) as PipelineEdge[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastBuiltSha: row.last_built_sha,
    matrix: parseMatrix(row.matrix_json),
  };
}

const SELECT_BASE = `
  SELECT p.*, plb.last_built_sha
  FROM pipelines p
  LEFT JOIN pipeline_last_build plb ON plb.pipeline_id = p.id
`;

export function listPipelines(projectId?: string): Pipeline[] {
  const sql = projectId
    ? `${SELECT_BASE} WHERE p.project_id = ? ORDER BY p.updated_at DESC`
    : `${SELECT_BASE} ORDER BY p.updated_at DESC`;
  const stmt = getDb().prepare(sql);
  const rows = (projectId ? stmt.all(projectId) : stmt.all()) as PipelineRow[];
  return rows.map(rowToPipeline);
}

export function getPipeline(id: string): Pipeline | null {
  const row = getDb().prepare(`${SELECT_BASE} WHERE p.id = ?`).get(id) as
    | PipelineRow
    | undefined;
  return row ? rowToPipeline(row) : null;
}

export interface PipelineInput {
  projectId: string;
  name: string;
  watch: PipelineWatch;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  // Cluster 11.C — declarative matrix. Omit / null for non-matrix pipelines.
  matrix?: Matrix | null;
}

function serialiseMatrix(matrix: Matrix | null | undefined): string | null {
  if (!matrix) return null;
  const axes = matrix.axes ?? {};
  const axisNames = Object.keys(axes);
  if (axisNames.length === 0) return null;
  for (const name of axisNames) {
    const vals = axes[name];
    if (!Array.isArray(vals) || vals.length === 0) return null;
  }
  return JSON.stringify({ axes });
}

export function createPipeline(input: PipelineInput): Pipeline {
  const id = randomUUID();
  const now = Date.now();
  const matrixJson = serialiseMatrix(input.matrix ?? null);
  // matrixSummary defaults to true to match the documented opt-in flag.
  const matrixSummary = input.watch.matrixSummary === false ? 0 : 1;
  getDb()
    .prepare(
      `INSERT INTO pipelines
       (id, project_id, name, watch_branch, watch_interval_sec, auto_trigger,
        nodes_json, edges_json, created_at, updated_at, telegram_approvals,
        tag_pattern, cron_expr, path_filter, cancel_in_progress_on_new_commit,
        matrix_json, matrix_summary,
        pr_commands, pr_command_authors)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.projectId,
      input.name,
      input.watch.branch,
      input.watch.intervalSec,
      input.watch.autoTrigger,
      JSON.stringify(encryptNodes(input.nodes)),
      JSON.stringify(input.edges),
      now,
      now,
      input.watch.telegramApprovals ? 1 : 0,
      input.watch.tagPattern ?? null,
      input.watch.cronExpr ?? null,
      input.watch.pathFilter ?? null,
      input.watch.cancelInProgressOnNewCommit ? 1 : 0,
      matrixJson,
      matrixSummary,
      input.watch.prCommands ?? null,
      input.watch.prCommandAuthors ?? null,
    );
  return {
    id,
    projectId: input.projectId,
    name: input.name,
    watch: {
      ...input.watch,
      matrixSummary: matrixSummary === 1,
    },
    nodes: input.nodes,
    edges: input.edges,
    createdAt: now,
    updatedAt: now,
    lastBuiltSha: null,
    matrix: matrixJson ? (input.matrix ?? null) : null,
  };
}

export function updatePipeline(
  id: string,
  input: Partial<Omit<PipelineInput, 'projectId'>>,
): Pipeline | null {
  const existing = getPipeline(id);
  if (!existing) return null;
  const merged: Pipeline = {
    ...existing,
    name: input.name ?? existing.name,
    watch: input.watch ?? existing.watch,
    nodes: input.nodes ?? existing.nodes,
    edges: input.edges ?? existing.edges,
    updatedAt: Date.now(),
    // `matrix` may be explicitly nulled — only fall back to the existing
    // value when the caller didn't include the key at all.
    matrix: input.matrix === undefined ? existing.matrix : input.matrix,
  };
  const matrixJson = serialiseMatrix(merged.matrix);
  const matrixSummary = merged.watch.matrixSummary === false ? 0 : 1;
  getDb()
    .prepare(
      `UPDATE pipelines SET
         name = ?, watch_branch = ?, watch_interval_sec = ?, auto_trigger = ?,
         nodes_json = ?, edges_json = ?, updated_at = ?, telegram_approvals = ?,
         tag_pattern = ?, cron_expr = ?, path_filter = ?,
         cancel_in_progress_on_new_commit = ?,
         matrix_json = ?, matrix_summary = ?,
         pr_commands = ?, pr_command_authors = ?
       WHERE id = ?`,
    )
    .run(
      merged.name,
      merged.watch.branch,
      merged.watch.intervalSec,
      merged.watch.autoTrigger,
      JSON.stringify(encryptNodes(merged.nodes)),
      JSON.stringify(merged.edges),
      merged.updatedAt,
      merged.watch.telegramApprovals ? 1 : 0,
      merged.watch.tagPattern ?? null,
      merged.watch.cronExpr ?? null,
      merged.watch.pathFilter ?? null,
      merged.watch.cancelInProgressOnNewCommit ? 1 : 0,
      matrixJson,
      matrixSummary,
      merged.watch.prCommands ?? null,
      merged.watch.prCommandAuthors ?? null,
      id,
    );
  merged.matrix = matrixJson ? merged.matrix : null;
  merged.watch = { ...merged.watch, matrixSummary: matrixSummary === 1 };
  return merged;
}

// Cluster 11.C — convenience updater used by `pipelineSetMatrix` API.
// Pass `null` to clear the matrix (revert to single-build behavior).
export function setPipelineMatrix(id: string, matrix: Matrix | null): Pipeline | null {
  return updatePipeline(id, { matrix });
}

export function deletePipeline(id: string): void {
  getDb().prepare('DELETE FROM pipelines WHERE id = ?').run(id);
}

export function clonePipeline(sourceId: string, newName?: string): Pipeline | null {
  const original = getPipeline(sourceId);
  if (!original) return null;
  // Re-id every node so the clone is independent. Remap edges to the new ids.
  const idMap = new Map<string, string>();
  const newNodes: PipelineNode[] = original.nodes.map((n) => {
    const newId = `n_${randomUUID().slice(0, 8)}`;
    idMap.set(n.id, newId);
    return { ...n, id: newId };
  });
  const newEdges: PipelineEdge[] = original.edges.map((e) => ({
    ...e,
    id: `e_${randomUUID().slice(0, 8)}`,
    source: idMap.get(e.source) ?? e.source,
    target: idMap.get(e.target) ?? e.target,
  }));
  return createPipeline({
    projectId: original.projectId,
    name: newName && newName.trim().length > 0 ? newName : `${original.name} (copy)`,
    watch: original.watch,
    nodes: newNodes,
    edges: newEdges,
    matrix: original.matrix,
  });
}

export function setPipelineLastBuiltSha(pipelineId: string, sha: string): void {
  getDb()
    .prepare(
      `INSERT INTO pipeline_last_build (pipeline_id, last_built_sha, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(pipeline_id) DO UPDATE SET
         last_built_sha = excluded.last_built_sha,
         updated_at = excluded.updated_at`,
    )
    .run(pipelineId, sha, Date.now());
}
