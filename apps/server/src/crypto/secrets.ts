import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Field-level encryption for secrets at rest. Sensitive values in pipeline
// node data, host passwords, telegram tokens, and node templates are wrapped
// with this so an attacker who reads ~/.buildpilot/db.sqlite or hosts.json or
// config.json cannot lift them straight out.
//
// Format: enc:1:<base64(iv | tag | ciphertext)>
//   - iv:        12 bytes (AES-GCM nonce)
//   - tag:       16 bytes (GCM auth tag)
//   - ciphertext: variable
//
// Master key lives at ~/.buildpilot/master.key (32 random bytes, base64).
// On POSIX we chmod 0600. On Windows we rely on the user's profile NTFS ACL.
//
// This protects against casual leaks (DB backups, screen sharing the API,
// committing config files). It does not protect against an attacker with
// read access to the same OS user's home directory — that user can decrypt.

const CONFIG_DIR = join(homedir(), '.buildpilot');
const KEY_FILE = join(CONFIG_DIR, 'master.key');
const PREFIX = 'enc:1:';
const ALG = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

let _key: Buffer | null = null;

function loadOrCreateKey(): Buffer {
  if (_key) return _key;
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  if (!existsSync(KEY_FILE)) {
    const fresh = randomBytes(KEY_LEN);
    writeFileSync(KEY_FILE, fresh.toString('base64'), { encoding: 'utf-8' });
    try {
      chmodSync(KEY_FILE, 0o600);
    } catch {
      // Windows chmod is mostly a no-op; NTFS ACL on the user profile dir
      // already restricts access.
    }
    _key = fresh;
    return fresh;
  }
  const raw = readFileSync(KEY_FILE, 'utf-8').trim();
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== KEY_LEN) {
    throw new Error(
      `master key at ${KEY_FILE} is ${buf.length} bytes, expected ${KEY_LEN}. ` +
        'Delete the file to regenerate (existing encrypted data will become unrecoverable).',
    );
  }
  _key = buf;
  return buf;
}

export function isEncrypted(s: unknown): s is string {
  return typeof s === 'string' && s.startsWith(PREFIX);
}

export function encryptSecret(plain: string): string {
  if (plain === '') return '';
  if (isEncrypted(plain)) return plain;
  const key = loadOrCreateKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decryptSecret(stored: string): string {
  if (!isEncrypted(stored)) return stored;
  const key = loadOrCreateKey();
  const blob = Buffer.from(stored.slice(PREFIX.length), 'base64');
  if (blob.length < IV_LEN + TAG_LEN) {
    throw new Error('encrypted blob too short');
  }
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = blob.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf-8');
}

// Field names treated as secrets. Match is case-sensitive on the exact key —
// each new step type that introduces a new credential field must be added
// here to be encrypted at rest.
export const SENSITIVE_FIELDS = new Set([
  'botToken',
  'password',
  'accessKeyId',
  'secretAccessKey',
  'apiKeyId',
  'apiIssuerId',
  'appPassword',
  'keychainPassword',
  'sentryAuthToken',
  'bugsnagApiKey',
  'webhookUrl',
  'smtpPassword',
  // Steam (Phase 6.5)
  'steamPassword',
  'steamWebApiKey',
  'steamGuardCode',
  // ASC API (Phase 5.B / 2.6.D)
  'ascPrivateKey',
  'ascApiKey',
  // Notarize (Phase 2.5) — additional aliases
  'apiKeyContents',
]);

export function encryptSecretsInObject<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  let changed = false;
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.has(k) && typeof v === 'string' && v.length > 0 && !isEncrypted(v)) {
      out[k] = encryptSecret(v);
      changed = true;
    } else {
      out[k] = v;
    }
  }
  return (changed ? out : obj) as T;
}

export function decryptSecretsInObject<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  let changed = false;
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.has(k) && isEncrypted(v)) {
      out[k] = decryptSecret(v);
      changed = true;
    } else {
      out[k] = v;
    }
  }
  return (changed ? out : obj) as T;
}

// Used by the at-startup migration sweep: only writes back if some field
// actually got encrypted, so an already-encrypted store is a no-op.
export function encryptObjectIfChanged<T extends Record<string, unknown>>(
  obj: T,
): { value: T; changed: boolean } {
  const next = encryptSecretsInObject(obj);
  return { value: next, changed: next !== obj };
}
