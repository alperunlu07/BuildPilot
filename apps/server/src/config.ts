import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ServerConfig } from '@buildpilot/shared-types';

const CONFIG_DIR = join(homedir(), '.buildpilot');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

// IANA dynamic/private port range (49152–65535); chosen to avoid collisions
// with anything on a typical dev machine.
const DEFAULT_CONFIG: ServerConfig = {
  host: '127.0.0.1',
  port: 49831,
  pollIntervalSec: 60,
  dbPath: join(CONFIG_DIR, 'db.sqlite'),
  webOrigin: 'http://127.0.0.1:49832',
};

// Configs written by older builds that still carry the previous well-known
// defaults — silently bumped to the new ones so existing installs migrate.
const LEGACY_DEFAULTS: ReadonlyArray<{ port: number; webOrigin: string }> = [
  { port: 7777, webOrigin: 'http://127.0.0.1:5173' },
];

function migrateLegacyDefaults(cfg: ServerConfig): ServerConfig {
  const match = LEGACY_DEFAULTS.find(
    (d) => cfg.port === d.port && cfg.webOrigin === d.webOrigin,
  );
  if (!match) return cfg;
  return { ...cfg, port: DEFAULT_CONFIG.port, webOrigin: DEFAULT_CONFIG.webOrigin };
}

export function loadConfig(): ServerConfig {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!existsSync(CONFIG_FILE)) {
    writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
    return { ...DEFAULT_CONFIG };
  }
  const raw = readFileSync(CONFIG_FILE, 'utf-8');
  const parsed = JSON.parse(raw) as Partial<ServerConfig>;
  const merged = { ...DEFAULT_CONFIG, ...parsed };
  const migrated = migrateLegacyDefaults(merged);
  if (migrated !== merged) {
    writeFileSync(CONFIG_FILE, JSON.stringify(migrated, null, 2), 'utf-8');
  }
  return migrated;
}

export const CONFIG_PATH = CONFIG_FILE;
