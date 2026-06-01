import { homedir } from 'node:os';
import { join } from 'node:path';

// Mirror the server's defaults (apps/server/src/config.ts). The desktop app
// talks to the server over loopback; both honour BUILDPILOT_* overrides so a
// dev profile can run on a different port without editing code.
export const SERVER_HOST = process.env.BUILDPILOT_HOST ?? '127.0.0.1';
export const SERVER_PORT = process.env.BUILDPILOT_API_PORT
  ? Number(process.env.BUILDPILOT_API_PORT)
  : 51731;

export const BASE_URL = `http://${SERVER_HOST}:${SERVER_PORT}`;

export const CONFIG_DIR = process.env.BUILDPILOT_HOME
  ? process.env.BUILDPILOT_HOME
  : join(homedir(), '.buildpilot');

// Where the desktop app stores its own preferences (auto-launch choice, etc).
export const DESKTOP_STATE_FILE = join(CONFIG_DIR, 'desktop.json');
