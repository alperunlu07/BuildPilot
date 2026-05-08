import { createPrivateKey, sign as cryptoSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// App Store Connect API auth + thin HTTP wrapper.
//
// ASC API uses ES256-signed JWTs (`alg: "ES256"`, `kid: <8-char API key id>`).
// The .p8 private key is a PEM-encoded EC P-256 key — Apple downloads it once
// at API key creation time, after which they only show the public half.
//
// Audience is hardcoded to "appstoreconnect-v1" and TTL is capped at 20 min by
// Apple. We sign on every request rather than caching tokens — the cost
// (~1ms ES256 sign) is dominated by network latency anyway.

const ASC_AUD = 'appstoreconnect-v1';
const DEFAULT_TTL_SEC = 1200; // 20 min — Apple's hard cap
const ASC_BASE = 'https://api.appstoreconnect.apple.com';

// Re-exported so tests can pin the timestamp without monkey-patching Date.
export interface JwtClock {
  nowSec(): number;
}
export const realClock: JwtClock = { nowSec: () => Math.floor(Date.now() / 1000) };

export interface AscJwtOpts {
  // 8-character key identifier shown next to the .p8 in App Store Connect.
  keyId: string;
  // UUID-ish issuer id from the Users + Access → Keys page.
  issuerId: string;
  // The full PEM contents of the .p8 file (-----BEGIN PRIVATE KEY-----…).
  privateKeyPem: string;
  // TTL in seconds. Capped at 1200 — Apple rejects longer.
  ttlSec?: number;
  clock?: JwtClock;
}

export interface AscJwtParts {
  header: { alg: 'ES256'; kid: string; typ: 'JWT' };
  payload: { iss: string; exp: number; aud: string };
  signingInput: string;
  jwt: string;
}

function base64UrlEncode(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'utf-8') : buf;
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Build the JWT but expose its parts so tests can verify shape without
// re-parsing the final string. The signing-input + signature concat happens
// at the end so we always return a valid token.
export function signAscJwt(opts: AscJwtOpts): AscJwtParts {
  if (!opts.keyId || opts.keyId.trim().length === 0) throw new Error('asc: missing keyId');
  if (!opts.issuerId || opts.issuerId.trim().length === 0) throw new Error('asc: missing issuerId');
  if (!opts.privateKeyPem || !opts.privateKeyPem.includes('BEGIN')) {
    throw new Error('asc: privateKeyPem must contain a PEM-encoded EC private key');
  }
  const ttl = Math.min(opts.ttlSec ?? DEFAULT_TTL_SEC, DEFAULT_TTL_SEC);
  const clock = opts.clock ?? realClock;
  const header = { alg: 'ES256' as const, kid: opts.keyId, typ: 'JWT' as const };
  const payload = {
    iss: opts.issuerId,
    exp: clock.nowSec() + ttl,
    aud: ASC_AUD,
  };
  const signingInput =
    base64UrlEncode(JSON.stringify(header)) + '.' + base64UrlEncode(JSON.stringify(payload));
  const key = createPrivateKey(opts.privateKeyPem);
  // dsaEncoding:'ieee-p1363' returns the raw 64-byte (r||s) signature JWS
  // requires; without it Node returns DER which ASC will reject.
  const sig = cryptoSign('sha256', Buffer.from(signingInput), { key, dsaEncoding: 'ieee-p1363' });
  const jwt = signingInput + '.' + base64UrlEncode(sig);
  return { header, payload, signingInput, jwt };
}

export interface AscCredentials {
  keyId: string;
  issuerId: string;
  // Provide ONE: a path to the .p8 OR the PEM contents directly.
  privateKeyPath?: string;
  privateKeyPem?: string;
}

export async function loadPrivateKey(creds: AscCredentials): Promise<string> {
  if (creds.privateKeyPem && creds.privateKeyPem.trim().length > 0) {
    return creds.privateKeyPem;
  }
  if (creds.privateKeyPath && creds.privateKeyPath.trim().length > 0) {
    return await readFile(creds.privateKeyPath, 'utf-8');
  }
  throw new Error('asc: provide privateKeyPath or privateKeyPem');
}

export interface AscRequestOpts {
  creds: AscCredentials;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  // Path under api.appstoreconnect.apple.com — leading slash optional.
  path: string;
  // Plain query params; appended unencoded so callers can pass full
  // "filter[type]=APPLE" style ASC keys.
  query?: Record<string, string | number | undefined>;
  // JSON body. ASC requires the JSON-API content type.
  body?: unknown;
  ttlSec?: number;
}

export interface AscResponse {
  status: number;
  ok: boolean;
  // Parsed JSON body for application/json responses; undefined for empty bodies.
  data?: unknown;
  // Raw text — useful when an error response is HTML or plain text.
  text: string;
}

// Single-shot HTTP request against the ASC API. Returns the parsed JSON body
// (or text on non-JSON), letting the caller distinguish error responses by
// status. Surfaces network failures by throwing.
export async function ascRequest(opts: AscRequestOpts): Promise<AscResponse> {
  const pem = await loadPrivateKey(opts.creds);
  const { jwt } = signAscJwt({
    keyId: opts.creds.keyId,
    issuerId: opts.creds.issuerId,
    privateKeyPem: pem,
    ttlSec: opts.ttlSec,
  });
  const path = opts.path.startsWith('/') ? opts.path : '/' + opts.path;
  const qs = opts.query
    ? '?' +
      Object.entries(opts.query)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  const url = ASC_BASE + path + qs;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${jwt}`,
    Accept: 'application/json',
  };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data: unknown;
  if (text.length > 0) {
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
  }
  return { status: res.status, ok: res.ok, data, text };
}

// Lift the ASC error envelope into a flat `Error` so step runners can throw
// it without forcing every callsite to walk `data.errors`.
export function ascErrorMessage(res: AscResponse): string {
  if (res.ok) return '';
  const d = res.data as { errors?: Array<{ status?: string; code?: string; title?: string; detail?: string }> } | undefined;
  if (d && Array.isArray(d.errors) && d.errors.length > 0) {
    return d.errors
      .map((e) => `${e.status ?? '?'} ${e.code ?? ''} ${e.title ?? ''} — ${e.detail ?? ''}`.trim())
      .join('; ');
  }
  return `HTTP ${res.status}: ${res.text.slice(0, 200)}`;
}
