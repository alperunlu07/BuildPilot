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

// The server's port/host are authoritative from its own config.json (the
// server reads them from there, NOT from env). Mirror that exact source so the
// two never disagree; fall back to the documented defaults when the file
// hasn't been written yet (a fresh install writes the same defaults). These
// match apps/server/src/config.ts DEFAULT_CONFIG.
const serverConfig = readJson(CONFIG_FILE);
export const SERVER_HOST =
  typeof serverConfig.host === 'string' ? serverConfig.host : '127.0.0.1';
export const SERVER_PORT =
  typeof serverConfig.port === 'number' ? serverConfig.port : 51731;

export const BASE_URL = `http://${SERVER_HOST}:${SERVER_PORT}`;

// Optional API token for when the server has auth enabled. Generated from the
// dashboard's API-tokens page and supplied either via BUILDPILOT_API_TOKEN or
// an `apiToken` field in desktop.json. Absent on default (auth-disabled)
// installs, where no credential is needed.
function readApiToken(): string | null {
  if (process.env.BUILDPILOT_API_TOKEN) return process.env.BUILDPILOT_API_TOKEN;
  const desktop = readJson(DESKTOP_STATE_FILE);
  return typeof desktop.apiToken === 'string' && desktop.apiToken
    ? desktop.apiToken
    : null;
}

export const API_TOKEN = readApiToken();

// Authorization header to attach to every API/SSE request — empty unless a
// token is configured.
export function authHeaders(): Record<string, string> {
  return API_TOKEN ? { authorization: `Bearer ${API_TOKEN}` } : {};
}
