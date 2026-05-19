import { randomUUID } from 'node:crypto';
import type { VaultFile } from '@buildpilot/shared-types';
import { VAULT_FILE_MAX_BYTES } from '@buildpilot/shared-types';
import { getDb } from './db';
import { decryptSecret, encryptSecret } from '../crypto/secrets';

// Cluster 11.B — file vault. Files are stored as the AES-256-GCM envelope
// produced by crypto/secrets.encryptSecret, persisted into a SQLite BLOB.
// We base64-encode the binary input before encryption so the existing
// secrets primitive (which assumes UTF-8 plaintext) can wrap it verbatim.

interface VaultFileRow {
  id: string;
  name: string;
  filename: string;
  mime: string;
  size_bytes: number;
  encrypted_content: Buffer;
  created_at: number;
  last_used_at: number | null;
}

function rowToVaultFile(row: VaultFileRow): VaultFile {
  return {
    id: row.id,
    name: row.name,
    filename: row.filename,
    mime: row.mime,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

const META_COLS =
  'id, name, filename, mime, size_bytes, created_at, last_used_at';

export function listVaultFiles(): VaultFile[] {
  const rows = getDb()
    .prepare(`SELECT ${META_COLS} FROM vault_files ORDER BY name`)
    .all() as Omit<VaultFileRow, 'encrypted_content'>[];
  return rows.map((r) => rowToVaultFile({ ...r, encrypted_content: Buffer.alloc(0) }));
}

export function getVaultFileMeta(name: string): VaultFile | null {
  const row = getDb()
    .prepare(`SELECT ${META_COLS} FROM vault_files WHERE name = ?`)
    .get(name) as Omit<VaultFileRow, 'encrypted_content'> | undefined;
  return row ? rowToVaultFile({ ...row, encrypted_content: Buffer.alloc(0) }) : null;
}

// Returns the decrypted binary contents. Throws if the file doesn't exist.
export function readVaultFileContents(name: string): Buffer {
  const row = getDb()
    .prepare('SELECT encrypted_content FROM vault_files WHERE name = ?')
    .get(name) as { encrypted_content: Buffer } | undefined;
  if (!row) throw new Error(`vault file not found: ${name}`);
  // The BLOB stores the enc:1:... envelope as UTF-8 bytes. Decode back to
  // string for the secrets primitive, then base64-decode the inner payload.
  const envelope = row.encrypted_content.toString('utf-8');
  const b64 = decryptSecret(envelope);
  return Buffer.from(b64, 'base64');
}

export function createVaultFile(input: {
  name: string;
  filename: string;
  mime: string;
  content: Buffer;
}): VaultFile {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(input.name)) {
    throw new Error(
      'vault file name must match /^[A-Za-z_][A-Za-z0-9_]*$/ (identifier characters only)',
    );
  }
  if (input.content.length === 0) throw new Error('vault file content cannot be empty');
  if (input.content.length > VAULT_FILE_MAX_BYTES) {
    throw new Error(
      `vault file exceeds ${VAULT_FILE_MAX_BYTES} byte cap (got ${input.content.length})`,
    );
  }
  const id = randomUUID();
  const now = Date.now();
  // Wrap the binary via base64 → encryptSecret so the inner crypto stays
  // string-oriented. Store the resulting envelope as UTF-8 bytes in the BLOB.
  const envelope = encryptSecret(input.content.toString('base64'));
  getDb()
    .prepare(
      `INSERT INTO vault_files
       (id, name, filename, mime, size_bytes, encrypted_content, created_at, last_used_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
    )
    .run(
      id,
      input.name,
      input.filename,
      input.mime,
      input.content.length,
      Buffer.from(envelope, 'utf-8'),
      now,
    );
  return {
    id,
    name: input.name,
    filename: input.filename,
    mime: input.mime,
    sizeBytes: input.content.length,
    createdAt: now,
    lastUsedAt: null,
  };
}

export function deleteVaultFile(name: string): boolean {
  const res = getDb().prepare('DELETE FROM vault_files WHERE name = ?').run(name);
  return res.changes > 0;
}

export function markVaultFileUsed(name: string, at: number = Date.now()): void {
  getDb()
    .prepare('UPDATE vault_files SET last_used_at = ? WHERE name = ?')
    .run(at, name);
}
