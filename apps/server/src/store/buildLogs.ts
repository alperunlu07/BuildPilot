import type { BuildLogEntry, BuildLogLevel, StepType } from '@buildpilot/shared-types';
import { getDb } from './db';

interface Row {
  id: number;
  build_id: string;
  ts: number;
  level: string;
  node_id: string | null;
  step_type: string | null;
  message: string;
}

function rowToEntry(row: Row): BuildLogEntry {
  return {
    seq: row.id,
    ts: row.ts,
    level: row.level as BuildLogLevel,
    nodeId: row.node_id,
    stepType: row.step_type as StepType | null,
    message: row.message,
  };
}

export interface BuildLogInput {
  buildId: string;
  ts: number;
  level: BuildLogLevel;
  nodeId: string | null;
  stepType: StepType | null;
  message: string;
}

export function appendBuildLogEntry(input: BuildLogInput): BuildLogEntry {
  const stmt = getDb().prepare(
    `INSERT INTO build_log_entries (build_id, ts, level, node_id, step_type, message)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const info = stmt.run(
    input.buildId,
    input.ts,
    input.level,
    input.nodeId,
    input.stepType,
    input.message,
  );
  return {
    seq: Number(info.lastInsertRowid),
    ts: input.ts,
    level: input.level,
    nodeId: input.nodeId,
    stepType: input.stepType,
    message: input.message,
  };
}

export function listBuildLogEntries(
  buildId: string,
  opts: { sinceSeq?: number; limit?: number } = {},
): BuildLogEntry[] {
  const limit = opts.limit ?? 5000;
  const sinceSeq = opts.sinceSeq ?? 0;
  const rows = getDb()
    .prepare(
      `SELECT * FROM build_log_entries
       WHERE build_id = ? AND id > ?
       ORDER BY id ASC
       LIMIT ?`,
    )
    .all(buildId, sinceSeq, limit) as Row[];
  return rows.map(rowToEntry);
}
