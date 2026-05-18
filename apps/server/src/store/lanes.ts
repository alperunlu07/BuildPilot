import { randomUUID } from 'node:crypto';
import type { Lane } from '@buildpilot/shared-types';
import { getDb } from './db';

interface LaneRow {
  id: string;
  name: string;
  max_concurrency: number;
  created_at: number;
}

function rowToLane(row: LaneRow): Lane {
  return {
    id: row.id,
    name: row.name,
    maxConcurrency: row.max_concurrency,
    createdAt: row.created_at,
  };
}

export function listLanes(): Lane[] {
  const rows = getDb()
    .prepare('SELECT * FROM lanes ORDER BY name ASC')
    .all() as LaneRow[];
  return rows.map(rowToLane);
}

export function getLane(id: string): Lane | null {
  const row = getDb().prepare('SELECT * FROM lanes WHERE id = ?').get(id) as
    | LaneRow
    | undefined;
  return row ? rowToLane(row) : null;
}

export function createLane(input: { name: string; maxConcurrency: number }): Lane {
  const id = randomUUID();
  const createdAt = Date.now();
  // UNIQUE name violations bubble up as better-sqlite3 SqliteError with
  // code === 'SQLITE_CONSTRAINT_UNIQUE'; the route layer translates that
  // into a 409 response, so we deliberately don't catch here.
  getDb()
    .prepare(
      `INSERT INTO lanes (id, name, max_concurrency, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(id, input.name, input.maxConcurrency, createdAt);
  return {
    id,
    name: input.name,
    maxConcurrency: input.maxConcurrency,
    createdAt,
  };
}

export function updateLane(
  id: string,
  patch: Partial<Pick<Lane, 'name' | 'maxConcurrency'>>,
): Lane | null {
  const existing = getLane(id);
  if (!existing) return null;
  const next: Lane = {
    ...existing,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.maxConcurrency !== undefined
      ? { maxConcurrency: patch.maxConcurrency }
      : {}),
  };
  getDb()
    .prepare('UPDATE lanes SET name = ?, max_concurrency = ? WHERE id = ?')
    .run(next.name, next.maxConcurrency, id);
  return next;
}

export function deleteLane(id: string): boolean {
  const info = getDb().prepare('DELETE FROM lanes WHERE id = ?').run(id);
  return info.changes > 0;
}
