import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ServerConfig } from '@buildpilot/shared-types';

const CONFIG_DIR = join(homedir(), '.buildpilot');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: ServerConfig = {
  host: '127.0.0.1',
  port: 7777,
  pollIntervalSec: 60,
  dbPath: join(CONFIG_DIR, 'db.sqlite'),
  webOrigin: 'http://127.0.0.1:5173',
};

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
  return { ...DEFAULT_CONFIG, ...parsed };
}

export const CONFIG_PATH = CONFIG_FILE;
