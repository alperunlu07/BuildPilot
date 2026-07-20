import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type {
  AiIntegrationsConfig,
  AuthConfig,
  DiscordConfig,
  GithubOAuthConfig,
  ServerConfig,
  SlackConfig,
  TelegramConfig,
} from '@buildpilot/shared-types';
import { decryptSecret, encryptSecret, isEncrypted } from './crypto/secrets';
import { CONFIG_DIR } from './paths';
import { ServerConfigSchema, formatValidationError } from './config-schema';

const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

// Windows (Hyper-V / WinNAT / WSL) reserves blocks of TCP ports, and binding
// inside one fails with EACCES even though nothing holds the port. Two earlier
// defaults were picked by finding a "free window" and both were later swallowed
// — 49831/49832 by the 49823–49922 block, then 51731/51732 by 51665–51764.
//
// Hunting for a safer constant does not work: reservations are per-machine and
// move across reboots, and on a stock Win11 host they start as low as port 1462
// — so no fixed default is safe. What we can do is (a) stay out of the IANA
// dynamic range (49152–65535), where Windows allocates and reserves most
// aggressively, and (b) fall back to another port at bind time instead of
// failing to start. See bindWithFallback in index.ts — that is the actual fix;
// this constant is only the first candidate it tries.
const DEFAULT_CONFIG: ServerConfig = {
  host: '127.0.0.1',
  port: 35700,
  pollIntervalSec: 60,
  dbPath: join(CONFIG_DIR, 'db.sqlite'),
  webOrigin: 'http://127.0.0.1:35701',
  telegram: {
    enabled: false,
    botToken: '',
    defaultChatId: '',
  },
  // Phase 4 Cluster D — disabled by default; opt in via config.json or env.
  buildRetentionDays: 0,
  // Cluster 11.A — auth is disabled by default. Flipping `enabled` to true
  // and restarting the server activates session + API-token enforcement; a
  // sessionSecret is generated automatically on first save if missing.
  auth: {
    enabled: false,
    sessionSecret: '',
  },
};

// Configs written by older builds that still carry the previous well-known
// defaults — silently bumped to the new ones so existing installs migrate.
const LEGACY_DEFAULTS: ReadonlyArray<{ port: number; webOrigin: string }> = [
  { port: 7777, webOrigin: 'http://127.0.0.1:5173' },
  { port: 49831, webOrigin: 'http://127.0.0.1:49832' },
  { port: 51731, webOrigin: 'http://127.0.0.1:51732' },
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
  if (cfg.auth) {
    out.auth = {
      ...cfg.auth,
      sessionSecret: cfg.auth.sessionSecret ? encryptSecret(cfg.auth.sessionSecret) : '',
    };
  }
  if (cfg.githubOAuth) {
    out.githubOAuth = {
      ...cfg.githubOAuth,
      clientSecret: cfg.githubOAuth.clientSecret
        ? encryptSecret(cfg.githubOAuth.clientSecret)
        : '',
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
  if (cfg.auth) {
    out.auth = {
      ...cfg.auth,
      sessionSecret: readSecret(cfg.auth.sessionSecret),
    };
  }
  if (cfg.githubOAuth) {
    out.githubOAuth = {
      ...cfg.githubOAuth,
      clientSecret: readSecret(cfg.githubOAuth.clientSecret),
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
  const a = cfg.auth;
  if (a) {
    if (a.sessionSecret && !isEncrypted(a.sessionSecret)) return true;
  }
  const g = cfg.githubOAuth;
  if (g) {
    if (g.clientSecret && !isEncrypted(g.clientSecret)) return true;
  }
  return false;
}

// Generate a fresh 32-byte hex session signing secret if auth is enabled
// but no secret has been provisioned yet. Idempotent: returns the input
// unchanged when a secret is already set or auth is disabled.
function ensureSessionSecret(cfg: ServerConfig): { cfg: ServerConfig; changed: boolean } {
  if (!cfg.auth || !cfg.auth.enabled) return { cfg, changed: false };
  if (cfg.auth.sessionSecret) return { cfg, changed: false };
  const secret = randomBytes(32).toString('hex');
  return { cfg: { ...cfg, auth: { ...cfg.auth, sessionSecret: secret } }, changed: true };
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
  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `Invalid JSON in ~/.buildpilot/config.json: ${msg}\n` +
        `Fix the syntax error and restart the server.\n`,
    );
    process.exit(1);
  }
  // Validate against the Zod schema BEFORE merging defaults. We pass the
  // raw object so any error messages cite the exact key the user wrote;
  // hiding behind a merged shape would obscure what's actually wrong on
  // disk. The schema is .passthrough() at the top level so unknown future
  // keys don't trip startup.
  const validation = ServerConfigSchema.safeParse(parsedRaw);
  if (!validation.success) {
    process.stderr.write(formatValidationError(validation.error, parsedRaw) + '\n');
    process.exit(1);
  }
  const parsed = validation.data as Partial<ServerConfig>;
  const merged = { ...DEFAULT_CONFIG, ...parsed } as ServerConfig;
  // Old configs predate the auth block — backfill the default so the rest
  // of the helpers can assume `cfg.auth` is always present.
  if (!merged.auth) merged.auth = { ...DEFAULT_CONFIG.auth! };
  const migrated = migrateLegacyDefaults(merged);
  const { cfg: withSecret, changed: secretChanged } = ensureSessionSecret(migrated);

  // Encrypt-at-rest sweep: if the file holds any plaintext telegram secrets,
  // rewrite the file with everything encrypted. Defaults migration also
  // triggers a rewrite so old port/origin pairs get pinned to the new ones.
  if (withSecret !== merged || secretChanged || needsRewrite(withSecret)) {
    writeFileSync(CONFIG_FILE, JSON.stringify(toOnDisk(withSecret), null, 2), 'utf-8');
  }
  const runtime = toRuntime(withSecret);
  cachedConfig = runtime;
  return runtime;
}

// Persist the port the server actually bound to. Both desktop apps and the web
// dev-server proxy read host/port straight out of config.json, so when the
// configured port is unusable and bindWithFallback lands on another one, that
// choice has to be written back — otherwise every client keeps dialling the
// port that just failed. No-op when the port already matches, so the common
// path doesn't rewrite the file on every boot.
export function persistPort(port: number): void {
  const base = cachedConfig ?? loadConfig();
  if (base.port === port) return;
  const updated: ServerConfig = { ...base, port };
  writeFileSync(CONFIG_FILE, JSON.stringify(toOnDisk(updated), null, 2), 'utf-8');
  cachedConfig = updated;
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

// ── Auth (Cluster 11.A) ────────────────────────────────────────────────────
export function getAuthConfigRuntime(): AuthConfig {
  return cachedConfig?.auth ?? { enabled: false, sessionSecret: '' };
}

export function saveAuthConfig(next: AuthConfig): AuthConfig {
  const base = cachedConfig ?? loadConfig();
  let merged: ServerConfig = { ...base, auth: { ...next } };
  const ensured = ensureSessionSecret(merged);
  merged = ensured.cfg;
  writeFileSync(CONFIG_FILE, JSON.stringify(toOnDisk(merged), null, 2), 'utf-8');
  cachedConfig = merged;
  return merged.auth!;
}

// ── GitHub OAuth (Cluster 11.E) ─────────────────────────────────────────────
export function getGithubOAuthRuntime(): GithubOAuthConfig | null {
  return cachedConfig?.githubOAuth ?? null;
}

export function saveGithubOAuthConfig(next: GithubOAuthConfig): GithubOAuthConfig {
  const base = cachedConfig ?? loadConfig();
  const updated: ServerConfig = { ...base, githubOAuth: { ...next } };
  writeFileSync(CONFIG_FILE, JSON.stringify(toOnDisk(updated), null, 2), 'utf-8');
  cachedConfig = updated;
  return updated.githubOAuth!;
}

// ── AI Integrations (UI-v2 Faz 10) ──────────────────────────────────────────
// Returns an empty block (not null) when nothing is configured so the
// runner code can `?? {}` without a null check. Nothing here is encrypted
// because path/model strings aren't secrets — toOnDisk/toRuntime pass the
// block through unchanged.
export function getAiIntegrationsRuntime(): AiIntegrationsConfig {
  return cachedConfig?.aiIntegrations ?? {};
}

export function saveAiIntegrationsConfig(
  next: AiIntegrationsConfig,
): AiIntegrationsConfig {
  const base = cachedConfig ?? loadConfig();
  const updated: ServerConfig = { ...base, aiIntegrations: { ...next } };
  writeFileSync(CONFIG_FILE, JSON.stringify(toOnDisk(updated), null, 2), 'utf-8');
  cachedConfig = updated;
  return updated.aiIntegrations!;
}

export const CONFIG_PATH = CONFIG_FILE;
