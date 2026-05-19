import type { Secret, VaultFile } from '@buildpilot/shared-types';

// Cluster 11.B item 4 — browser-side encrypted bundle for transporting
// secrets + vault files between machines. Encryption is done via the
// SubtleCrypto API: PBKDF2 (SHA-256, 200_000 iters) → AES-GCM. The
// resulting envelope is base64 + JSON so it can be pasted in plain
// text. Note that the server never exposes secret plaintexts, so the
// exported bundle only ships secret *names* — the user must fill in
// each value before re-importing on the other side.

const PBKDF2_ITERS = 200_000;
const KEY_LEN_BITS = 256;
const SALT_LEN = 16;
const IV_LEN = 12;

export type ImportConflictPolicy = 'skip' | 'rename';

export interface BundleFileEntry {
  name: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  // Files larger than the inline cap are exported as metadata only —
  // the user must transfer them out-of-band.
  contentBase64: string | null;
}

export interface BundleSecretEntry {
  name: string;
  // Always null when the bundle is built by the dashboard (the server
  // doesn't surface plaintext). Round-trip importers can populate this
  // field before re-importing if they had access to the value.
  value: string | null;
  plaintextProvided: boolean;
}

export interface BundlePayload {
  version: 1;
  exportedAt: number;
  secrets: BundleSecretEntry[];
  files: BundleFileEntry[];
}

export interface BundleEnvelope {
  kind: 'buildpilot-vault-bundle';
  version: 1;
  saltBase64: string;
  ivBase64: string;
  ciphertextBase64: string;
}

export interface ImportSummary {
  secretsImported: number;
  secretsSkipped: number;
  secretsRenamed: number;
  filesImported: number;
  filesSkipped: number;
  filesRenamed: number;
  errors: string[];
}

function getCrypto(): SubtleCrypto {
  if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) {
    throw new Error(
      'WebCrypto is not available in this environment — vault bundles need a secure context.',
    );
  }
  return globalThis.crypto.subtle;
}

function randomBytes(len: number): Uint8Array {
  const buf = new Uint8Array(len);
  globalThis.crypto.getRandomValues(buf);
  return buf;
}

// Wrap a Uint8Array into a fresh ArrayBuffer view so the WebCrypto type
// surface (which under TS 5.9 insists on ArrayBuffer rather than the
// generic ArrayBufferLike) accepts it without complaint. The double cast
// via `unknown` keeps strict mode happy without erasing other guarantees.
function asBufferSource(bytes: Uint8Array): BufferSource {
  return bytes as unknown as BufferSource;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const subtle = getCrypto();
  const baseKey = await subtle.importKey(
    'raw',
    asBufferSource(new TextEncoder().encode(passphrase)),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: asBufferSource(salt),
      iterations: PBKDF2_ITERS,
    },
    baseKey,
    { name: 'AES-GCM', length: KEY_LEN_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export async function buildExportBundle(
  input: {
    secrets: Secret[];
    files: Array<VaultFile & { contentBase64: string | null }>;
  },
  passphrase: string,
): Promise<string> {
  const payload: BundlePayload = {
    version: 1,
    exportedAt: Date.now(),
    secrets: input.secrets.map((s) => ({
      name: s.name,
      value: null,
      plaintextProvided: false,
    })),
    files: input.files.map((f) => ({
      name: f.name,
      filename: f.filename,
      mime: f.mime,
      sizeBytes: f.sizeBytes,
      contentBase64: f.contentBase64,
    })),
  };

  const subtle = getCrypto();
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = await deriveKey(passphrase, salt);
  const ct = new Uint8Array(
    await subtle.encrypt(
      { name: 'AES-GCM', iv: asBufferSource(iv) },
      key,
      asBufferSource(new TextEncoder().encode(JSON.stringify(payload))),
    ),
  );
  const envelope: BundleEnvelope = {
    kind: 'buildpilot-vault-bundle',
    version: 1,
    saltBase64: bytesToBase64(salt),
    ivBase64: bytesToBase64(iv),
    ciphertextBase64: bytesToBase64(ct),
  };
  return JSON.stringify(envelope, null, 2);
}

export async function parseImportBundle(
  text: string,
  passphrase: string,
): Promise<BundlePayload> {
  let envelope: BundleEnvelope;
  try {
    envelope = JSON.parse(text) as BundleEnvelope;
  } catch (err) {
    throw new Error(
      `bundle is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (envelope.kind !== 'buildpilot-vault-bundle' || envelope.version !== 1) {
    throw new Error('not a recognised BuildPilot vault bundle (wrong kind/version)');
  }
  const subtle = getCrypto();
  const salt = base64ToBytes(envelope.saltBase64);
  const iv = base64ToBytes(envelope.ivBase64);
  const ct = base64ToBytes(envelope.ciphertextBase64);
  const key = await deriveKey(passphrase, salt);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await subtle.decrypt(
      { name: 'AES-GCM', iv: asBufferSource(iv) },
      key,
      asBufferSource(ct),
    );
  } catch {
    throw new Error('decryption failed — wrong passphrase or corrupted bundle');
  }
  const payload = JSON.parse(new TextDecoder().decode(plaintext)) as BundlePayload;
  // Defensive: normalise shape so downstream code doesn't have to defend
  // against malformed (but cleanly-decrypted) payloads.
  return {
    version: payload.version,
    exportedAt: payload.exportedAt,
    secrets: Array.isArray(payload.secrets)
      ? payload.secrets.map((s) => ({
          name: s.name,
          value: s.value ?? null,
          plaintextProvided: typeof s.value === 'string' && s.value.length > 0,
        }))
      : [],
    files: Array.isArray(payload.files)
      ? payload.files.map((f) => ({
          name: f.name,
          filename: f.filename,
          mime: f.mime,
          sizeBytes: f.sizeBytes,
          contentBase64: f.contentBase64 ?? null,
        }))
      : [],
  };
}
