import { createPrivateKey, sign as cryptoSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// Google Play Developer API auth + thin helpers.
//
// The Play API uses an RS256-signed JWT bearer assertion: build an
// "assertion" JWT signed with a service-account private key, POST it to
// Google's OAuth token endpoint, get back a short-lived access_token, and
// use that as a Bearer on the actual API calls.
//
// We sign on every step run; the token TTL is 1 hour and the JWT assertion
// itself is single-use, so caching across step boundaries isn't worth the
// state.

const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const PLAY_BASE = 'https://androidpublisher.googleapis.com';
const ASSERTION_TTL_SEC = 3600;

export interface PlayClock {
  nowSec(): number;
}
export const realPlayClock: PlayClock = { nowSec: () => Math.floor(Date.now() / 1000) };

export interface ServiceAccountKey {
  // The standard Play .json key has these fields. We only consume the two
  // we sign with — `client_email` (sub/iss for the assertion) and
  // `private_key` (PEM RS256 private key).
  client_email: string;
  private_key: string;
  // Optional fields preserved for diagnostics.
  type?: string;
  project_id?: string;
  private_key_id?: string;
}

function base64UrlEncode(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'utf-8') : buf;
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface PlayAssertionOpts {
  key: ServiceAccountKey;
  ttlSec?: number;
  clock?: PlayClock;
  scope?: string;
}

// Build a Google-style service-account JWT assertion. Exposed for unit
// testing of the encoding shape — the real OAuth exchange happens in
// `getPlayAccessToken`.
export function signPlayAssertion(opts: PlayAssertionOpts): string {
  const key = opts.key;
  if (!key.client_email || key.client_email.length === 0) {
    throw new Error('play: service account key is missing "client_email"');
  }
  if (!key.private_key || !key.private_key.includes('BEGIN')) {
    throw new Error('play: service account key is missing "private_key" (PEM)');
  }
  const clock = opts.clock ?? realPlayClock;
  const now = clock.nowSec();
  const header = { alg: 'RS256' as const, typ: 'JWT' as const };
  const payload = {
    iss: key.client_email,
    scope: opts.scope ?? SCOPE,
    aud: OAUTH_TOKEN_URL,
    iat: now,
    exp: now + Math.min(opts.ttlSec ?? ASSERTION_TTL_SEC, ASSERTION_TTL_SEC),
  };
  const signingInput =
    base64UrlEncode(JSON.stringify(header)) + '.' + base64UrlEncode(JSON.stringify(payload));
  const pk = createPrivateKey(key.private_key);
  const sig = cryptoSign('sha256', Buffer.from(signingInput), pk);
  return signingInput + '.' + base64UrlEncode(sig);
}

export async function loadServiceAccountKey(opts: {
  serviceAccountJsonPath?: string;
  playServiceAccountJson?: string;
}): Promise<ServiceAccountKey> {
  let raw: string;
  if (opts.playServiceAccountJson && opts.playServiceAccountJson.trim().length > 0) {
    raw = opts.playServiceAccountJson;
  } else if (
    opts.serviceAccountJsonPath &&
    opts.serviceAccountJsonPath.trim().length > 0
  ) {
    raw = await readFile(opts.serviceAccountJsonPath, 'utf-8');
  } else {
    throw new Error(
      'play: provide "serviceAccountJsonPath" or paste contents into "playServiceAccountJson"',
    );
  }
  let parsed: ServiceAccountKey;
  try {
    parsed = JSON.parse(raw) as ServiceAccountKey;
  } catch (e) {
    throw new Error(`play: failed to parse service-account JSON: ${(e as Error).message}`);
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('play: service-account JSON is missing client_email / private_key');
  }
  return parsed;
}

export async function getPlayAccessToken(key: ServiceAccountKey): Promise<string> {
  const assertion = signPlayAssertion({ key });
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`play OAuth exchange failed: HTTP ${res.status} ${text.slice(0, 300)}`);
  }
  const data = JSON.parse(text) as { access_token?: string };
  if (!data.access_token) {
    throw new Error(`play OAuth exchange returned no access_token: ${text.slice(0, 200)}`);
  }
  return data.access_token;
}

export interface PlayRequestOpts {
  accessToken: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  // For binary uploads — when set, body is treated as the raw payload and
  // contentType overrides the default JSON content type.
  rawBody?: Buffer;
  contentType?: string;
}

export interface PlayResponse {
  status: number;
  ok: boolean;
  data?: unknown;
  text: string;
}

export async function playRequest(opts: PlayRequestOpts): Promise<PlayResponse> {
  const path = opts.path.startsWith('/') ? opts.path : '/' + opts.path;
  const qs = opts.query
    ? '?' +
      Object.entries(opts.query)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  const url = PLAY_BASE + path + qs;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.accessToken}`,
  };
  let body: string | Uint8Array | undefined;
  if (opts.rawBody) {
    headers['Content-Type'] = opts.contentType ?? 'application/octet-stream';
    body = new Uint8Array(opts.rawBody);
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = opts.contentType ?? 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers,
    body,
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

export function playErrorMessage(res: PlayResponse): string {
  if (res.ok) return '';
  const d = res.data as { error?: { code?: number; message?: string; status?: string } } | undefined;
  if (d?.error) {
    return `${d.error.code ?? '?'} ${d.error.status ?? ''}: ${d.error.message ?? ''}`.trim();
  }
  return `HTTP ${res.status}: ${res.text.slice(0, 200)}`;
}

// Parse "lang=text" multiline release notes input. The Play API takes a list
// of `{ language, text }` objects on tracks.releases[].releaseNotes.
export function parseReleaseNotes(s: string | undefined): Array<{ language: string; text: string }> {
  if (!s || s.trim().length === 0) return [];
  const out: Array<{ language: string; text: string }> = [];
  for (const line of s.split(/\r?\n/)) {
    const idx = line.indexOf('=');
    if (idx < 1) continue;
    const language = line.slice(0, idx).trim();
    const text = line.slice(idx + 1);
    if (language.length === 0) continue;
    out.push({ language, text });
  }
  return out;
}
