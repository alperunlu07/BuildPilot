import { randomUUID } from 'node:crypto';
import type { Secret } from '@buildpilot/shared-types';
import { getDb } from './db';
import { decryptSecret, encryptSecret } from '../crypto/secrets';

// Cluster 11.B — secrets vault. Each row is an AES-256-GCM envelope keyed
// by a unique human-readable name. The value never leaves the server in
// plaintext; the API surfaces metadata only and the engine resolves the
// plaintext at run time via decryptSecretValue() / resolveSecretsByName().

interface SecretRow {
  id: string;
  name: string;
  encrypted_value: string;
  created_at: number;
  updated_at: number;
  last_used_at: number | null;
}

function rowToSecret(row: SecretRow): Secret {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at,
  };
}

export function listSecrets(): Secret[] {
  const rows = getDb()
    .prepare('SELECT * FROM secrets ORDER BY name')
    .all() as SecretRow[];
  return rows.map(rowToSecret);
}

export function getSecret(name: string): Secret | null {
  const row = getDb()
    .prepare('SELECT * FROM secrets WHERE name = ?')
    .get(name) as SecretRow | undefined;
  return row ? rowToSecret(row) : null;
}

// Returns the plaintext value, decrypting on the fly. Returns null when
// no secret with that name exists. Used by the interpolation pass.
export function decryptSecretValue(name: string): string | null {
  const row = getDb()
    .prepare('SELECT encrypted_value FROM secrets WHERE name = ?')
    .get(name) as { encrypted_value: string } | undefined;
  if (!row) return null;
  return decryptSecret(row.encrypted_value);
}

export function createSecret(name: string, value: string): Secret {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(
      'secret name must match /^[A-Za-z_][A-Za-z0-9_]*$/ (identifier characters only)',
    );
  }
  if (value.length === 0) throw new Error('secret value cannot be empty');
  const id = randomUUID();
  const now = Date.now();
  const encrypted = encryptSecret(value);
  getDb()
    .prepare(
      `INSERT INTO secrets (id, name, encrypted_value, created_at, updated_at, last_used_at)
       VALUES (?, ?, ?, ?, ?, NULL)`,
    )
    .run(id, name, encrypted, now, now);
  return {
    id,
    name,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null,
  };
}

// Rotate the value while preserving id/name/createdAt. The previous
// envelope is overwritten irreversibly — there's no undo because we don't
// keep a value history.
export function rotateSecret(name: string, value: string): Secret | null {
  if (value.length === 0) throw new Error('secret value cannot be empty');
  const existing = getSecret(name);
  if (!existing) return null;
  const now = Date.now();
  const encrypted = encryptSecret(value);
  getDb()
    .prepare('UPDATE secrets SET encrypted_value = ?, updated_at = ? WHERE name = ?')
    .run(encrypted, now, name);
  return { ...existing, updatedAt: now };
}

export function deleteSecret(name: string): boolean {
  const res = getDb().prepare('DELETE FROM secrets WHERE name = ?').run(name);
  return res.changes > 0;
}

// Called by the interpolation pass each time a secret is resolved so the
// "last used" column reflects actual engine consumption.
export function markSecretUsed(name: string, at: number = Date.now()): void {
  getDb()
    .prepare('UPDATE secrets SET last_used_at = ? WHERE name = ?')
    .run(at, name);
}

// Bulk resolver used by the interpolation pass. Returns a name -> value
// map for every referenced secret that exists; missing names are simply
// absent (the interpolator leaves their markers untouched and logs).
export function resolveSecretsByName(names: Iterable<string>): Map<string, string> {
  const db = getDb();
  const out = new Map<string, string>();
  for (const name of names) {
    if (out.has(name)) continue;
    const row = db
      .prepare('SELECT encrypted_value FROM secrets WHERE name = ?')
      .get(name) as { encrypted_value: string } | undefined;
    if (row) out.set(name, decryptSecret(row.encrypted_value));
  }
  return out;
}
