import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// The desktop app talks to the server over loopback. BUILDPILOT_HOME relocates
// the whole on-disk profile (config, DB, …) and is honoured by both sides.
export const CONFIG_DIR = process.env.BUILDPILOT_HOME
  ? process.env.BUILDPILOT_HOME
  : join(homedir(), '.buildpilot');

const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

// Where the desktop app stores its own preferences (auto-launch choice,
// optional API token, …).
export const DESKTOP_STATE_FILE = join(CONFIG_DIR, 'desktop.json');

function readJson(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// Default host/port match apps/server/src/config.ts DEFAULT_CONFIG — used when
// the server's config.json hasn't been written yet (a fresh install writes the
// same defaults).
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 35700;

interface ResolvedConfig {
  host: string;
  port: number;
  token: string | null;
}

// The host/port/token were previously resolved once at module load, so a port
// or token change (or the server's own config migration) desynced the desktop
// process until it was restarted. Resolve lazily into a cache instead, and
// expose refresh() so callers can re-read after a known change. Behaviour is
// identical while the config doesn't change — the first access populates the
// cache exactly as the old top-level reads did.
let cached: ResolvedConfig | null = null;

// Whether we've already emitted the non-loopback warning this resolution, so a
// hot config that pins a LAN host doesn't spam the log on every accessor call.
let warnedNonLoopback = false;

function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === '127.0.0.1' || h === '::1' || h === 'localhost';
}

// The server's port/host are authoritative from its own config.json (the
// server reads them from there, NOT from env). Mirror that exact source so the
// two never disagree; fall back to the documented defaults when the file
// hasn't been written yet.
function resolve(onLog?: (line: string) => void): ResolvedConfig {
  const serverConfig = readJson(CONFIG_FILE);
  const host =
    typeof serverConfig.host === 'string' ? serverConfig.host : DEFAULT_HOST;
  const port =
    typeof serverConfig.port === 'number' ? serverConfig.port : DEFAULT_PORT;

  // The desktop assumes loopback: it adopts/spawns the server locally and
  // attaches a token only when auth is on. A non-loopback host with auth
  // disabled exposes the dashboard + API to anyone on the LAN — warn loudly so
  // it's a deliberate choice, not a silent default.
  if (!isLoopbackHost(host) && !warnedNonLoopback) {
    warnedNonLoopback = true;
    onLog?.(
      `WARNING: server host "${host}" is not a loopback address. The desktop ` +
        'app assumes loopback; a non-loopback host with auth disabled exposes ' +
        'the BuildPilot dashboard and API to other machines on the LAN.',
    );
  }

  return { host, port, token: resolveApiToken() };
}

// Optional API token for when the server has auth enabled. Generated from the
// dashboard's API-tokens page and supplied either via BUILDPILOT_API_TOKEN or
// an `apiToken` field in desktop.json. Absent on default (auth-disabled)
// installs, where no credential is needed.
function resolveApiToken(): string | null {
  if (process.env.BUILDPILOT_API_TOKEN) return process.env.BUILDPILOT_API_TOKEN;
  const desktop = readJson(DESKTOP_STATE_FILE);
  return typeof desktop.apiToken === 'string' && desktop.apiToken
    ? desktop.apiToken
    : null;
}

function get(): ResolvedConfig {
  if (!cached) cached = resolve();
  return cached;
}

// Re-read the server config + token from disk, replacing the cache. Call after
// a known change (e.g. the server reports a different port, or a token is
// added) so accessors stop returning stale values without an app restart.
// `onLog` lets the caller surface the non-loopback warning into the same log
// stream the server uses.
export function refreshConfig(onLog?: (line: string) => void): void {
  warnedNonLoopback = false;
  cached = resolve(onLog);
}

export function getBaseUrl(): string {
  const { host, port } = get();
  return `http://${host}:${port}`;
}

// Authorization header to attach to every API/SSE request — empty unless a
// token is configured.
export function getAuthHeaders(): Record<string, string> {
  const { token } = get();
  return token ? { authorization: `Bearer ${token}` } : {};
}
