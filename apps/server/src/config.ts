import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  DiscordConfig,
  ServerConfig,
  SlackConfig,
  TelegramConfig,
} from '@buildpilot/shared-types';
import { decryptSecret, encryptSecret, isEncrypted } from './crypto/secrets';
import { CONFIG_DIR } from './paths';

const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

// IANA dynamic/private port range (49152–65535). The previous defaults
// (49831/49832) collided with Windows Hyper-V's reserved dynamic-port block
// (49823–49922 here), which produces EACCES at bind time even with no
// process holding the port. 51731/51732 land in the safe 50695–53849
// window outside every reservation observed on a default Win11 host.
const DEFAULT_CONFIG: ServerConfig = {
  host: '127.0.0.1',
  port: 51731,
  pollIntervalSec: 60,
  dbPath: join(CONFIG_DIR, 'db.sqlite'),
  webOrigin: 'http://127.0.0.1:51732',
  telegram: {
    enabled: false,
    botToken: '',
    defaultChatId: '',
  },
  // Phase 4 Cluster D — disabled by default; opt in via config.json or env.
  buildRetentionDays: 0,
};

// Configs written by older builds that still carry the previous well-known
// defaults — silently bumped to the new ones so existing installs migrate.
const LEGACY_DEFAULTS: ReadonlyArray<{ port: number; webOrigin: string }> = [
  { port: 7777, webOrigin: 'http://127.0.0.1:5173' },
  { port: 49831, webOrigin: 'http://127.0.0.1:49832' },
];

function migrateLegacyDefaults(cfg: ServerConfig): ServerConfig {
  const match = LEGACY_DEFAULTS.find(
    (d) => cfg.port === d.port && cfg.webOrigin === d.webOrigin,
  );
  if (!match) return cfg;
  return { ...cfg, port: DEFAULT_CONFIG.port, webOrigin: DEFAULT_CONFIG.webOrigin };
}

// In-process cache so /api/config/telegram can read the runtime (plaintext)
// telegram config without re-reading the file every request, and so the bot
// restart path has a single source of truth.
let cachedConfig: ServerConfig | null = null;

// Decrypts a secret-shaped value if it carries the enc:1: prefix; otherwise
// returns it as-is (legacy plaintext from older configs).
function readSecret(v: string | undefined): string {
  if (!v) return '';
  return isEncrypted(v) ? decryptSecret(v) : v;
}

// Build the on-disk representation: token + chat ID are stored encrypted.
// We always re-encrypt even if the input was already an enc: blob — encryptSecret
// is idempotent for that case (returns as-is).
function toOnDisk(cfg: ServerConfig): ServerConfig {
  const out: ServerConfig = { ...cfg };
  if (cfg.telegram) {
    out.telegram = {
      ...cfg.telegram,
      botToken: cfg.telegram.botToken ? encryptSecret(cfg.telegram.botToken) : '',
      defaultChatId: cfg.telegram.defaultChatId ? encryptSecret(cfg.telegram.defaultChatId) : '',
    };
  }
  if (cfg.slack) {
    out.slack = {
      ...cfg.slack,
      signingSecret: cfg.slack.signingSecret ? encryptSecret(cfg.slack.signingSecret) : '',
      botToken: cfg.slack.botToken ? encryptSecret(cfg.slack.botToken) : '',
    };
  }
  if (cfg.discord) {
    out.discord = {
      ...cfg.discord,
      publicKey: cfg.discord.publicKey ? encryptSecret(cfg.discord.publicKey) : '',
    };
  }
  return out;
}

// Build the runtime representation: secrets are decrypted so callers (the
// telegram bot, the telegramNotify step) can use them directly.
function toRuntime(cfg: ServerConfig): ServerConfig {
  const out: ServerConfig = { ...cfg };
  if (cfg.telegram) {
    out.telegram = {
      ...cfg.telegram,
      botToken: readSecret(cfg.telegram.botToken),
      defaultChatId: readSecret(cfg.telegram.defaultChatId),
    };
  }
  if (cfg.slack) {
    out.slack = {
      ...cfg.slack,
      signingSecret: readSecret(cfg.slack.signingSecret),
      botToken: readSecret(cfg.slack.botToken),
    };
  }
  if (cfg.discord) {
    out.discord = {
      ...cfg.discord,
      publicKey: readSecret(cfg.discord.publicKey),
    };
  }
  return out;
}

// True when the file representation differs from what toOnDisk would write —
// i.e. some secret-shaped field is still plaintext and needs to be migrated.
function needsRewrite(cfg: ServerConfig): boolean {
  const t = cfg.telegram;
  if (t) {
    if (t.botToken && !isEncrypted(t.botToken)) return true;
    if (t.defaultChatId && !isEncrypted(t.defaultChatId)) return true;
  }
  const s = cfg.slack;
  if (s) {
    if (s.signingSecret && !isEncrypted(s.signingSecret)) return true;
    if (s.botToken && !isEncrypted(s.botToken)) return true;
  }
  const d = cfg.discord;
  if (d) {
    if (d.publicKey && !isEncrypted(d.publicKey)) return true;
  }
  return false;
}

export function loadConfig(): ServerConfig {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!existsSync(CONFIG_FILE)) {
    writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
    cachedConfig = { ...DEFAULT_CONFIG };
    return { ...DEFAULT_CONFIG };
  }
  const raw = readFileSync(CONFIG_FILE, 'utf-8');
  const parsed = JSON.parse(raw) as Partial<ServerConfig>;
  const merged = { ...DEFAULT_CONFIG, ...parsed } as ServerConfig;
  const migrated = migrateLegacyDefaults(merged);

  // Encrypt-at-rest sweep: if the file holds any plaintext telegram secrets,
  // rewrite the file with everything encrypted. Defaults migration also
  // triggers a rewrite so old port/origin pairs get pinned to the new ones.
  if (migrated !== merged || needsRewrite(migrated)) {
    writeFileSync(CONFIG_FILE, JSON.stringify(toOnDisk(migrated), null, 2), 'utf-8');
  }
  const runtime = toRuntime(migrated);
  cachedConfig = runtime;
  return runtime;
}

// Persist a new telegram config to disk (encrypted) and update the in-process
// cache. Returns the runtime (plaintext) shape so the caller can hand it to
// startTelegramBot directly.
export function saveTelegramConfig(next: TelegramConfig): TelegramConfig {
  const base = cachedConfig ?? loadConfig();
  const updated: ServerConfig = { ...base, telegram: { ...next } };
  writeFileSync(CONFIG_FILE, JSON.stringify(toOnDisk(updated), null, 2), 'utf-8');
  cachedConfig = updated;
  return updated.telegram!;
}

export function getTelegramConfigRuntime(): TelegramConfig | null {
  return cachedConfig?.telegram ?? null;
}

// ── Slack (Cluster 11.I) ────────────────────────────────────────────────────
export function getSlackConfigRuntime(): SlackConfig | null {
  return cachedConfig?.slack ?? null;
}

export function saveSlackConfig(next: SlackConfig): SlackConfig {
  const base = cachedConfig ?? loadConfig();
  const updated: ServerConfig = { ...base, slack: { ...next } };
  writeFileSync(CONFIG_FILE, JSON.stringify(toOnDisk(updated), null, 2), 'utf-8');
  cachedConfig = updated;
  return updated.slack!;
}

// ── Discord (Cluster 11.I) ──────────────────────────────────────────────────
export function getDiscordConfigRuntime(): DiscordConfig | null {
  return cachedConfig?.discord ?? null;
}

export function saveDiscordConfig(next: DiscordConfig): DiscordConfig {
  const base = cachedConfig ?? loadConfig();
  const updated: ServerConfig = { ...base, discord: { ...next } };
  writeFileSync(CONFIG_FILE, JSON.stringify(toOnDisk(updated), null, 2), 'utf-8');
  cachedConfig = updated;
  return updated.discord!;
}

export const CONFIG_PATH = CONFIG_FILE;
