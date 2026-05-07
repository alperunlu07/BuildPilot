import type { PipelineNode } from '@buildpilot/shared-types';
import { getDb } from '../store/db';
import { logger } from '../logger';
import { isEncrypted, SENSITIVE_FIELDS, encryptSecret } from './secrets';

// One-time sweep: re-encrypts any plaintext secret fields found in
// pipelines.nodes_json and node_templates.data_json. Idempotent — fields
// already wrapped with the enc:1: prefix are skipped, so calling this on
// every boot is safe. Hosts (hosts.json) and the telegram bot token in
// config.json are migrated transparently by their own readers/writers.

function encryptIfNeeded(data: Record<string, unknown>): {
  next: Record<string, unknown>;
  changed: boolean;
} {
  let changed = false;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (SENSITIVE_FIELDS.has(k) && typeof v === 'string' && v.length > 0 && !isEncrypted(v)) {
      out[k] = encryptSecret(v);
      changed = true;
    } else {
      out[k] = v;
    }
  }
  return { next: out, changed };
}

export function migratePlaintextSecrets(): void {
  const db = getDb();
  let pipelinesTouched = 0;
  let nodesTouched = 0;
  let templatesTouched = 0;

  const pipelineRows = db
    .prepare<unknown[], { id: string; nodes_json: string }>('SELECT id, nodes_json FROM pipelines')
    .all();
  for (const row of pipelineRows) {
    const nodes = JSON.parse(row.nodes_json) as PipelineNode[];
    let pipelineChanged = false;
    const nextNodes = nodes.map((n) => {
      const { next, changed } = encryptIfNeeded(n.data);
      if (changed) {
        nodesTouched += 1;
        pipelineChanged = true;
        return { ...n, data: next };
      }
      return n;
    });
    if (pipelineChanged) {
      db.prepare('UPDATE pipelines SET nodes_json = ? WHERE id = ?').run(
        JSON.stringify(nextNodes),
        row.id,
      );
      pipelinesTouched += 1;
    }
  }

  const templateRows = db
    .prepare<unknown[], { id: string; data_json: string }>(
      'SELECT id, data_json FROM node_templates',
    )
    .all();
  for (const row of templateRows) {
    const data = JSON.parse(row.data_json) as Record<string, unknown>;
    const { next, changed } = encryptIfNeeded(data);
    if (changed) {
      db.prepare('UPDATE node_templates SET data_json = ? WHERE id = ?').run(
        JSON.stringify(next),
        row.id,
      );
      templatesTouched += 1;
    }
  }

  if (pipelinesTouched + templatesTouched > 0) {
    logger.info(
      { pipelinesTouched, nodesTouched, templatesTouched },
      'encrypted plaintext secrets at rest',
    );
  }
}
