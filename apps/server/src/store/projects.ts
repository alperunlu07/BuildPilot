import { randomUUID } from 'node:crypto';
import type { Project, VcsProvider } from '@buildpilot/shared-types';
import { getDb } from './db';

interface ProjectRow {
  id: string;
  name: string;
  path: string;
  default_branch: string;
  created_at: number;
  vcs_provider: string | null;
  vcs_repo: string | null;
  vcs_credential_id: string | null;
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    defaultBranch: row.default_branch,
    createdAt: row.created_at,
    vcsProvider: (row.vcs_provider as VcsProvider | null) ?? null,
    vcsRepo: row.vcs_repo ?? null,
    vcsCredentialId: row.vcs_credential_id ?? null,
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

// Cluster 11.E — update the VCS link for a project. All three fields move
// together; passing null on any of them clears the link entirely.
export function updateProjectVcs(
  id: string,
  vcs: {
    vcsProvider: VcsProvider | null;
    vcsRepo: string | null;
    vcsCredentialId: string | null;
  },
): Project | null {
  // Normalize: if any required field is empty, clear all three (we only
  // post when the full triple is present).
  const allPresent =
    vcs.vcsProvider !== null && vcs.vcsRepo !== null && vcs.vcsRepo.length > 0 && vcs.vcsCredentialId !== null;
  const provider = allPresent ? vcs.vcsProvider : null;
  const repo = allPresent ? vcs.vcsRepo : null;
  const cred = allPresent ? vcs.vcsCredentialId : null;
  getDb()
    .prepare(
      `UPDATE projects SET vcs_provider = ?, vcs_repo = ?, vcs_credential_id = ? WHERE id = ?`,
    )
    .run(provider, repo, cred, id);
  return getProject(id);
}
