import type { BuildArtifact } from '@buildpilot/shared-types';
import { getDb } from './db';

interface Row {
  id: number;
  build_id: string;
  path: string;
  size: number;
  mtime: number;
  created_at: number;
}

function rowToArtifact(row: Row): BuildArtifact {
  return {
    id: row.id,
    buildId: row.build_id,
    path: row.path,
    size: row.size,
    mtime: row.mtime,
    createdAt: row.created_at,
  };
}

export interface BuildArtifactInput {
  buildId: string;
  path: string;
  size: number;
  mtime: number;
}

export function insertBuildArtifact(input: BuildArtifactInput): BuildArtifact {
  const createdAt = Date.now();
  const stmt = getDb().prepare(
    `INSERT INTO build_artifacts (build_id, path, size, mtime, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const info = stmt.run(input.buildId, input.path, input.size, input.mtime, createdAt);
  return {
    id: Number(info.lastInsertRowid),
    buildId: input.buildId,
    path: input.path,
    size: input.size,
    mtime: input.mtime,
    createdAt,
  };
}

export function listBuildArtifacts(buildId: string): BuildArtifact[] {
  const rows = getDb()
    .prepare('SELECT * FROM build_artifacts WHERE build_id = ? ORDER BY id ASC')
    .all(buildId) as Row[];
  return rows.map(rowToArtifact);
}

export function getBuildArtifact(id: number): BuildArtifact | null {
  const row = getDb().prepare('SELECT * FROM build_artifacts WHERE id = ?').get(id) as
    | Row
    | undefined;
  return row ? rowToArtifact(row) : null;
}
