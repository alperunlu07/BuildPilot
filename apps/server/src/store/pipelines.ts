import { randomUUID } from 'node:crypto';
import type {
  Pipeline,
  PipelineEdge,
  PipelineNode,
  PipelineWatch,
} from '@buildpilot/shared-types';
import { getDb } from './db';

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
    },
    nodes: JSON.parse(row.nodes_json) as PipelineNode[],
    edges: JSON.parse(row.edges_json) as PipelineEdge[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastBuiltSha: row.last_built_sha,
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
}

export function createPipeline(input: PipelineInput): Pipeline {
  const id = randomUUID();
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO pipelines
       (id, project_id, name, watch_branch, watch_interval_sec, auto_trigger,
        nodes_json, edges_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.projectId,
      input.name,
      input.watch.branch,
      input.watch.intervalSec,
      input.watch.autoTrigger,
      JSON.stringify(input.nodes),
      JSON.stringify(input.edges),
      now,
      now,
    );
  return {
    id,
    projectId: input.projectId,
    name: input.name,
    watch: input.watch,
    nodes: input.nodes,
    edges: input.edges,
    createdAt: now,
    updatedAt: now,
    lastBuiltSha: null,
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
  };
  getDb()
    .prepare(
      `UPDATE pipelines SET
         name = ?, watch_branch = ?, watch_interval_sec = ?, auto_trigger = ?,
         nodes_json = ?, edges_json = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      merged.name,
      merged.watch.branch,
      merged.watch.intervalSec,
      merged.watch.autoTrigger,
      JSON.stringify(merged.nodes),
      JSON.stringify(merged.edges),
      merged.updatedAt,
      id,
    );
  return merged;
}

export function deletePipeline(id: string): void {
  getDb().prepare('DELETE FROM pipelines WHERE id = ?').run(id);
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
