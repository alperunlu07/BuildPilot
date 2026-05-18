import { getDb } from './db';

// Cluster 11.F — per-pipeline list of test keys the user has flagged as
// flaky/quarantined. Stored as a JSON array in `pipelines.flaky_quarantine_json`
// so we can roundtrip without a new table. The runner doesn't honor this
// flag yet (see UX-ROADMAP follow-up) — today it's purely a UI marker
// surfaced on the Flaky tests page.

function parse(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((s): s is string => typeof s === 'string');
  } catch {
    return [];
  }
}

export function getFlakyQuarantine(pipelineId: string): string[] {
  const row = getDb()
    .prepare('SELECT flaky_quarantine_json AS j FROM pipelines WHERE id = ?')
    .get(pipelineId) as { j: string | null } | undefined;
  if (!row) return [];
  return parse(row.j);
}

export function setFlakyQuarantine(pipelineId: string, keys: string[]): string[] {
  // De-dupe + sort so the JSON column is stable across writes (avoids
  // pointless diff churn).
  const cleaned = Array.from(new Set(keys.filter((k) => k.length > 0))).sort();
  getDb()
    .prepare('UPDATE pipelines SET flaky_quarantine_json = ? WHERE id = ?')
    .run(JSON.stringify(cleaned), pipelineId);
  return cleaned;
}

export function toggleFlakyQuarantine(
  pipelineId: string,
  testKey: string,
  quarantined: boolean,
): string[] {
  const current = new Set(getFlakyQuarantine(pipelineId));
  if (quarantined) current.add(testKey);
  else current.delete(testKey);
  return setFlakyQuarantine(pipelineId, Array.from(current));
}
