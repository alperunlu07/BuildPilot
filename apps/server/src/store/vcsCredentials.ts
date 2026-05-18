import { randomUUID } from 'node:crypto';
import type { VcsCredential, VcsProvider } from '@buildpilot/shared-types';
import { getDb } from './db';
import {
  decryptSecret,
  encryptSecret,
  isEncrypted,
} from '../crypto/secrets';

// Cluster 11.E — saved VCS credentials used by the outbound check-run +
// PR-context lookups. The token is encrypted at rest using the same crypto
// module the rest of the codebase relies on; the field name (`vcsToken`)
// is on the SENSITIVE_FIELDS allow-list so the at-startup migration sweep
// re-encrypts plaintext rows from older dumps.

interface VcsCredentialRow {
  id: string;
  name: string;
  provider: string;
  base_url: string | null;
  token: string; // enc:1:… or legacy plaintext (very brief window)
  created_at: number;
}

function previewToken(plain: string): string {
  if (!plain) return '';
  if (plain.length <= 6) return '•'.repeat(plain.length);
  return `••••${plain.slice(-4)}`;
}

function rowToPublic(row: VcsCredentialRow): VcsCredential {
  const decrypted = isEncrypted(row.token) ? safeDecrypt(row.token) : row.token;
  return {
    id: row.id,
    name: row.name,
    provider: row.provider as VcsProvider,
    baseUrl: row.base_url ?? null,
    tokenPreview: previewToken(decrypted),
    createdAt: row.created_at,
  };
}

function safeDecrypt(stored: string): string {
  try {
    return decryptSecret(stored);
  } catch {
    return '';
  }
}

export function listVcsCredentials(): VcsCredential[] {
  const rows = getDb()
    .prepare('SELECT * FROM vcs_credentials ORDER BY created_at DESC')
    .all() as VcsCredentialRow[];
  return rows.map(rowToPublic);
}

export function getVcsCredentialPublic(id: string): VcsCredential | null {
  const row = getDb()
    .prepare('SELECT * FROM vcs_credentials WHERE id = ?')
    .get(id) as VcsCredentialRow | undefined;
  return row ? rowToPublic(row) : null;
}

// Internal — returns the decrypted token. Only the outbound posters call this.
export function getVcsCredentialRuntime(
  id: string,
): { id: string; provider: VcsProvider; baseUrl: string | null; token: string; name: string } | null {
  const row = getDb()
    .prepare('SELECT * FROM vcs_credentials WHERE id = ?')
    .get(id) as VcsCredentialRow | undefined;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    provider: row.provider as VcsProvider,
    baseUrl: row.base_url ?? null,
    token: isEncrypted(row.token) ? safeDecrypt(row.token) : row.token,
  };
}

export function createVcsCredential(input: {
  name: string;
  provider: VcsProvider;
  baseUrl?: string;
  vcsToken: string;
}): VcsCredential {
  const id = randomUUID();
  const createdAt = Date.now();
  const encrypted = encryptSecret(input.vcsToken);
  getDb()
    .prepare(
      `INSERT INTO vcs_credentials (id, name, provider, base_url, token, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.name,
      input.provider,
      input.baseUrl && input.baseUrl.length > 0 ? input.baseUrl : null,
      encrypted,
      createdAt,
    );
  return {
    id,
    name: input.name,
    provider: input.provider,
    baseUrl: input.baseUrl ?? null,
    tokenPreview: previewToken(input.vcsToken),
    createdAt,
  };
}

export function deleteVcsCredential(id: string): void {
  getDb().prepare('DELETE FROM vcs_credentials WHERE id = ?').run(id);
}
