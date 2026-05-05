import { randomUUID } from 'node:crypto';
import type { Project } from '@buildpilot/shared-types';
import { getDb } from './db';

interface ProjectRow {
  id: string;
  name: string;
  path: string;
  default_branch: string;
  created_at: number;
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    defaultBranch: row.default_branch,
    createdAt: row.created_at,
  };
}

export function listProjects(): Project[] {
  const rows = getDb()
    .prepare('SELECT * FROM projects ORDER BY created_at DESC')
    .all() as ProjectRow[];
  return rows.map(rowToProject);
}

export function getProject(id: string): Project | null {
  const row = getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id) as
    | ProjectRow
    | undefined;
  return row ? rowToProject(row) : null;
}

export function getProjectByPath(path: string): Project | null {
  const row = getDb().prepare('SELECT * FROM projects WHERE path = ?').get(path) as
    | ProjectRow
    | undefined;
  return row ? rowToProject(row) : null;
}

export function createProject(input: {
  name: string;
  path: string;
  defaultBranch: string;
}): Project {
  const id = randomUUID();
  const createdAt = Date.now();
  getDb()
    .prepare(
      `INSERT INTO projects (id, name, path, default_branch, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(id, input.name, input.path, input.defaultBranch, createdAt);
  return {
    id,
    name: input.name,
    path: input.path,
    defaultBranch: input.defaultBranch,
    createdAt,
  };
}

export function deleteProject(id: string): void {
  getDb().prepare('DELETE FROM projects WHERE id = ?').run(id);
}
