// Cluster 12 — project export bundle helper.
//
// Pure functions: reference scanner, payload builder, AES-GCM/PBKDF2
// encrypt / decrypt. The Fastify route layer in `api/projectExport.ts`
// drives these and handles auth + audit.

import {
  createCipheriv,
  createDecipheriv,
  pbkdf2Sync,
  randomBytes,
} from 'node:crypto';
import type {
  Pipeline,
  ProjectBundleEnvelope,
  ProjectBundlePayload,
} from '@buildpilot/shared-types';

const PBKDF2_ITERS = 200_000;
const KEY_LEN = 32;
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;

// Browser-side bundles (lib/secretsBundle.ts) use the SAME parameters so
// future cross-creation roundtrip stays possible. Any change here must be
// mirrored there.
const PBKDF2_HASH = 'sha256';

const SECRET_RE = /\$\{\{\s*secrets\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
const FILE_RE = /\$\{\{\s*files\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

// Field names that step `data` objects use to reference a saved host.
// Keep this in sync with `apps/server/src/runner/steps/_exec.ts` and
// `_ssh.ts` — every step type that picks a saved host via id field
// must list its field here so the export bundle picks up the host.
const HOST_ID_FIELDS = new Set(['hostId', 'targetHostId']);

export interface BundleReferences {
  secretNames: Set<string>;
  fileNames: Set<string>;
  hostIds: Set<string>;
}

// Walk every pipeline's node data and collect the names of referenced
// external resources. Markers inside string fields are matched by regex;
// host-id fields by exact key. Unknown keys are ignored — adding a new
// kind of reference later is purely additive here.
export function scanReferences(pipelines: Pipeline[]): BundleReferences {
  const secretNames = new Set<string>();
  const fileNames = new Set<string>();
  const hostIds = new Set<string>();

  function visit(value: unknown, parentKey?: string): void {
    if (typeof value === 'string') {
      if (parentKey && HOST_ID_FIELDS.has(parentKey) && value.trim().length > 0) {
        hostIds.add(value.trim());
      }
      for (const m of value.matchAll(SECRET_RE)) {
        if (m[1]) secretNames.add(m[1]);
      }
      for (const m of value.matchAll(FILE_RE)) {
        if (m[1]) fileNames.add(m[1]);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, parentKey);
      return;
    }
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        visit(v, k);
      }
    }
  }

  for (const p of pipelines) {
    for (const node of p.nodes) visit(node.data);
  }

  return { secretNames, fileNames, hostIds };
}

// PBKDF2 key derivation. salt is supplied by the caller so encrypt and
// decrypt share the same value. Iteration count + hash match the
// browser-side helper byte-for-byte.
function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return pbkdf2Sync(passphrase, salt, PBKDF2_ITERS, KEY_LEN, PBKDF2_HASH);
}

export function encryptPayload(
  payload: ProjectBundlePayload,
  passphrase: string,
): ProjectBundleEnvelope {
  if (passphrase.length < 8) {
    throw new Error('passphrase must be at least 8 characters');
  }
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf-8');
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  // tag is appended to ciphertext so the browser-side decryptor (which
  // expects the WebCrypto AES-GCM layout: ct || tag) can verify in one
  // shot without an extra field.
  const ctWithTag = Buffer.concat([ct, tag]);
  return {
    kind: 'buildpilot-project-bundle',
    version: 1,
    saltBase64: salt.toString('base64'),
    ivBase64: iv.toString('base64'),
    ciphertextBase64: ctWithTag.toString('base64'),
  };
}

export function decryptEnvelope(
  envelope: ProjectBundleEnvelope,
  passphrase: string,
): ProjectBundlePayload {
  if (envelope.kind !== 'buildpilot-project-bundle') {
    throw new Error('not a buildpilot project bundle');
  }
  if (envelope.version !== 1) {
    throw new Error(`unsupported bundle version: ${envelope.version}`);
  }
  const salt = Buffer.from(envelope.saltBase64, 'base64');
  const iv = Buffer.from(envelope.ivBase64, 'base64');
  const ctWithTag = Buffer.from(envelope.ciphertextBase64, 'base64');
  if (salt.length !== SALT_LEN) throw new Error('invalid salt length');
  if (iv.length !== IV_LEN) throw new Error('invalid iv length');
  if (ctWithTag.length < TAG_LEN) throw new Error('ciphertext too short');
  const ct = ctWithTag.subarray(0, ctWithTag.length - TAG_LEN);
  const tag = ctWithTag.subarray(ctWithTag.length - TAG_LEN);
  const key = deriveKey(passphrase, salt);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  let pt: Buffer;
  try {
    pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch {
    throw new Error('decryption failed — wrong passphrase or corrupted bundle');
  }
  const parsed = JSON.parse(pt.toString('utf-8')) as ProjectBundlePayload;
  if (parsed.version !== 1) throw new Error(`unsupported payload version: ${parsed.version}`);
  return parsed;
}

// Pick a fresh name when the imported entity collides with an existing one
// under the 'rename' policy. Appends _2, _3, … until a free slot opens.
export function nextAvailableName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let i = 2;
  let candidate = `${base}_${i}`;
  while (taken.has(candidate)) {
    i += 1;
    candidate = `${base}_${i}`;
  }
  return candidate;
}
