import type { FastifyInstance } from 'fastify';
// Both POSIX and Win32 path modules so we can validate Windows-style
// absolute paths (C:\...) even when the server runs on Linux/macOS, and
// vice versa. The host platform's `node:path` import alone would reject
// the other family — which would break the dashboard's cross-platform
// edit flow for shops that point a remote dashboard at a worker on a
// different OS.
import { win32 as winPath, posix as posixPath } from 'node:path';
import { z } from 'zod';
import type {
  AiIntegrationsConfig,
  DiscordConfig,
  DiscordConfigPublic,
  SlackConfig,
  SlackConfigPublic,
  TelegramConfig,
  TelegramConfigPublic,
} from '@buildpilot/shared-types';
import {
  getAiIntegrationsRuntime,
  getDiscordConfigRuntime,
  getSlackConfigRuntime,
  getTelegramConfigRuntime,
  saveAiIntegrationsConfig,
  saveDiscordConfig,
  saveSlackConfig,
  saveTelegramConfig,
} from '../config';
import { startTelegramBot, stopTelegramBot } from '../runner/telegramBot';
import { logger } from '../logger';

// Render a non-reversible preview for a stored secret. We keep the last 4
// chars so the user can recognise *which* token is set, without leaking
// enough to abuse it. Empty input renders empty.
function preview(s: string): string {
  if (!s) return '';
  if (s.length <= 4) return '••••';
  return `••••${s.slice(-4)}`;
}

// Chat IDs that start with "@" are public channel handles, not secrets —
// surface those in full so the dashboard can show "@my_team".
function chatPreview(s: string): string {
  if (!s) return '';
  if (s.startsWith('@')) return s;
  return preview(s);
}

function toPublic(cfg: TelegramConfig | null): TelegramConfigPublic {
  if (!cfg) {
    return {
      enabled: false,
      hasBotToken: false,
      botTokenPreview: '',
      hasChatId: false,
      chatIdPreview: '',
    };
  }
  return {
    enabled: Boolean(cfg.enabled),
    hasBotToken: Boolean(cfg.botToken),
    botTokenPreview: preview(cfg.botToken),
    hasChatId: Boolean(cfg.defaultChatId),
    chatIdPreview: chatPreview(cfg.defaultChatId),
  };
}

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  // Empty strings mean "leave the existing value" — see the type definition.
  botToken: z.string().optional(),
  defaultChatId: z.string().optional(),
  clearBotToken: z.boolean().optional(),
  clearChatId: z.boolean().optional(),
});

const testSchema = z.object({
  // Optional override: lets the user test a new token / chat before saving.
  botToken: z.string().optional(),
  chatId: z.string().optional(),
});

const slackUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  signingSecret: z.string().optional(),
  botToken: z.string().optional(),
  defaultChannel: z.string().optional(),
  clearSigningSecret: z.boolean().optional(),
  clearBotToken: z.boolean().optional(),
});

const discordUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  publicKey: z.string().optional(),
  applicationId: z.string().optional(),
  defaultChannelId: z.string().optional(),
  clearPublicKey: z.boolean().optional(),
});

// AI Integrations: every field optional so the dashboard can PATCH a single
// tool override without round-tripping the entire block. Empty string is
// treated as "clear this override" — saves a separate clear-flag per field.
// Security — the `path` we accept here is fed straight to spawn() as the
// command argument in aiPrompt.ts; `model` is appended to argv. Without
// constraints any caller able to reach this endpoint can pivot from
// "edit AI tool overrides" to arbitrary code execution (path) or to
// passing destructive flags to the CLI (model).
//
// path guards (defence in depth, cross-platform):
//   1. Absolute path required via node:path's isAbsolute() — handles
//      POSIX (/usr/local/bin/claude) AND Windows
//      (C:\Program Files\Claude\claude.exe) without each platform's
//      callers needing a fork
//   2. Basename must equal the expected CLI name, with Windows binary
//      extensions (.exe / .cmd / .bat / .ps1) stripped before
//      comparison. So an attacker can't point claude.path at
//      /bin/bash; they could only point it at a binary literally
//      named `claude` (or claude.exe on Windows) somewhere on disk
//
// model guard:
//   • Restricted to [A-Za-z0-9._:/-] up to 128 chars. Blocks
//     argv-injection (--dangerously-skip-permissions etc.) — the most
//     permissive set that still admits real model identifiers like
//     "claude-opus-4-7", "gpt-4o:latest", "vendor/model:v1.2"
//
// Empty string still clears (override slot becomes a no-op), undefined
// still keeps the existing value (per-tool PATCH semantics preserved).
const WINDOWS_BINARY_EXTS = ['.exe', '.cmd', '.bat', '.ps1'];
function stripBinaryExt(name: string): string {
  const lower = name.toLowerCase();
  for (const ext of WINDOWS_BINARY_EXTS) {
    if (lower.endsWith(ext)) return name.slice(0, -ext.length);
  }
  return name;
}

// `model` allowlist: alnum + . _ : / -, length 1-128.
//
// Two guards baked into one regex:
//   • Character set blocks shell metacharacters and whitespace (so
//     "claude --verbose" or "claude $(touch /tmp/x)" never matches)
//   • The leading character class excludes `-`, so an argv-flag like
//     "--dangerously-skip-permissions" never matches even though `-`
//     is allowed mid-string for real identifiers ("claude-opus-4-7")
//
// The lookahead-style "no leading -" is done by splitting the regex
// into a single-char prefix + the rest, rather than a negative
// lookahead, to keep the pattern obvious to readers.
const MODEL_RE = /^[A-Za-z0-9._:/][A-Za-z0-9._:/-]{0,127}$/;

function isAbsoluteCrossPlatform(p: string): boolean {
  // posixPath.isAbsolute("/usr/bin/x") → true
  // winPath.isAbsolute("C:\\Program Files\\x.exe") → true
  // winPath.isAbsolute("/usr/bin/x") → false (no drive)
  // Accepting either side keeps the dashboard usable from any host OS.
  return posixPath.isAbsolute(p) || winPath.isAbsolute(p);
}

function crossPlatformBasename(p: string): string {
  // Win32 basename handles both / and \ separators; POSIX basename
  // splits on / only. Use win32 for Windows-style inputs and POSIX
  // for the rest so we never miss a separator. Detected by isAbsolute
  // since paths are already guaranteed absolute by the refine above.
  return winPath.isAbsolute(p) ? winPath.basename(p) : posixPath.basename(p);
}

function aiToolUpdateSchemaForTool(expectedBasename: string) {
  return z.object({
    path: z
      .string()
      .optional()
      .refine(
        (value) => {
          if (value === undefined) return true;
          const trimmed = value.trim();
          if (trimmed.length === 0) return true; // clear override
          if (!isAbsoluteCrossPlatform(trimmed)) return false;
          const raw = crossPlatformBasename(trimmed);
          return stripBinaryExt(raw) === expectedBasename;
        },
        {
          message: `path must be empty or an absolute path whose basename is "${expectedBasename}" (with optional .exe/.cmd/.bat/.ps1)`,
        },
      ),
    model: z
      .string()
      .optional()
      .refine(
        (value) => {
          if (value === undefined) return true;
          if (value.trim().length === 0) return true; // clear override
          return MODEL_RE.test(value);
        },
        {
          message:
            'model must be empty or 1-128 chars from [A-Za-z0-9._:/-] starting with alphanumeric/./_/:; flags + shell metacharacters are rejected to prevent argv injection',
        },
      ),
  });
}

const aiIntegrationsUpdateSchema = z.object({
  claude: aiToolUpdateSchemaForTool('claude').optional(),
  codex: aiToolUpdateSchemaForTool('codex').optional(),
  aider: aiToolUpdateSchemaForTool('aider').optional(),
  gemini: aiToolUpdateSchemaForTool('gemini').optional(),
});

function toSlackPublic(cfg: SlackConfig | null): SlackConfigPublic {
  if (!cfg) {
    return {
      enabled: false,
      hasSigningSecret: false,
      signingSecretPreview: '',
      hasBotToken: false,
      botTokenPreview: '',
      defaultChannel: '',
    };
  }
  return {
    enabled: Boolean(cfg.enabled),
    hasSigningSecret: Boolean(cfg.signingSecret),
    signingSecretPreview: preview(cfg.signingSecret),
    hasBotToken: Boolean(cfg.botToken),
    botTokenPreview: preview(cfg.botToken),
    defaultChannel: cfg.defaultChannel ?? '',
  };
}

function toDiscordPublic(cfg: DiscordConfig | null): DiscordConfigPublic {
  if (!cfg) {
    return {
      enabled: false,
      hasPublicKey: false,
      publicKeyPreview: '',
      applicationId: '',
      defaultChannelId: '',
    };
  }
  return {
    enabled: Boolean(cfg.enabled),
    hasPublicKey: Boolean(cfg.publicKey),
    publicKeyPreview: preview(cfg.publicKey),
    applicationId: cfg.applicationId ?? '',
    defaultChannelId: cfg.defaultChannelId ?? '',
  };
}

export async function configRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/config/telegram', async () => {
    return toPublic(getTelegramConfigRuntime());
  });

  app.put('/api/config/telegram', async (req, reply) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const input = parsed.data;
    const existing = getTelegramConfigRuntime() ?? {
      enabled: false,
      botToken: '',
      defaultChatId: '',
    };

    // Merge semantics: clearX wins over a provided value; an empty/undefined
    // string keeps the existing value (so the form can submit without forcing
    // the user to re-type the token every save).
    const nextBotToken = input.clearBotToken
      ? ''
      : input.botToken && input.botToken.length > 0
        ? input.botToken
        : existing.botToken;
    const nextChatId = input.clearChatId
      ? ''
      : input.defaultChatId && input.defaultChatId.length > 0
        ? input.defaultChatId
        : existing.defaultChatId;
    const nextEnabled =
      typeof input.enabled === 'boolean' ? input.enabled : existing.enabled;

    const merged: TelegramConfig = {
      enabled: nextEnabled,
      botToken: nextBotToken,
      defaultChatId: nextChatId,
    };

    const saved = saveTelegramConfig(merged);

    // Restart bot to pick up the new config. stop is a no-op if nothing was
    // running, and start will short-circuit if the new config disables it.
    try {
      stopTelegramBot();
      startTelegramBot(saved);
    } catch (err) {
      logger.warn({ err: String(err) }, 'failed to restart telegram bot after config update');
    }

    return toPublic(saved);
  });

  // ── Slack (Cluster 11.I) ─────────────────────────────────
  app.get('/api/config/slack', async () => {
    return toSlackPublic(getSlackConfigRuntime());
  });

  app.put('/api/config/slack', async (req, reply) => {
    const parsed = slackUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const input = parsed.data;
    const existing = getSlackConfigRuntime() ?? {
      enabled: false,
      signingSecret: '',
      botToken: '',
      defaultChannel: '',
    };
    const nextSigningSecret = input.clearSigningSecret
      ? ''
      : input.signingSecret && input.signingSecret.length > 0
        ? input.signingSecret
        : existing.signingSecret;
    const nextBotToken = input.clearBotToken
      ? ''
      : input.botToken && input.botToken.length > 0
        ? input.botToken
        : existing.botToken;
    const merged: SlackConfig = {
      enabled: typeof input.enabled === 'boolean' ? input.enabled : existing.enabled,
      signingSecret: nextSigningSecret,
      botToken: nextBotToken,
      defaultChannel:
        typeof input.defaultChannel === 'string'
          ? input.defaultChannel
          : existing.defaultChannel,
    };
    const saved = saveSlackConfig(merged);
    return toSlackPublic(saved);
  });

  // ── Discord (Cluster 11.I) ───────────────────────────────
  app.get('/api/config/discord', async () => {
    return toDiscordPublic(getDiscordConfigRuntime());
  });

  app.put('/api/config/discord', async (req, reply) => {
    const parsed = discordUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const input = parsed.data;
    const existing = getDiscordConfigRuntime() ?? {
      enabled: false,
      publicKey: '',
      applicationId: '',
      defaultChannelId: '',
    };
    const nextPublicKey = input.clearPublicKey
      ? ''
      : input.publicKey && input.publicKey.length > 0
        ? input.publicKey
        : existing.publicKey;
    const merged: DiscordConfig = {
      enabled: typeof input.enabled === 'boolean' ? input.enabled : existing.enabled,
      publicKey: nextPublicKey,
      applicationId:
        typeof input.applicationId === 'string'
          ? input.applicationId
          : existing.applicationId,
      defaultChannelId:
        typeof input.defaultChannelId === 'string'
          ? input.defaultChannelId
          : existing.defaultChannelId,
    };
    const saved = saveDiscordConfig(merged);
    return toDiscordPublic(saved);
  });

  // ── AI Integrations (UI-v2 Faz 10) ───────────────────────────────────────
  // Path/model overrides for the four built-in AI CLIs. Empty strings clear
  // the override (caller doesn't need separate clear-flags); omitted tool
  // keys keep their existing overrides untouched (per-tool PATCH semantics).
  app.get('/api/config/ai-integrations', async () => {
    return getAiIntegrationsRuntime();
  });

  app.put('/api/config/ai-integrations', async (req, reply) => {
    const parsed = aiIntegrationsUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const input = parsed.data;
    const existing = getAiIntegrationsRuntime();

    // Per-tool merge: empty string clears, undefined keeps existing, any
    // other value overwrites. Strip fully-empty tool blocks so the JSON
    // stays minimal — { claude: {} } would otherwise persist forever.
    function mergeTool(
      prev: AiIntegrationsConfig['claude'] | undefined,
      next: AiIntegrationsConfig['claude'] | undefined,
    ): AiIntegrationsConfig['claude'] | undefined {
      if (next === undefined) return prev;
      const path =
        next.path === undefined
          ? prev?.path
          : next.path.trim().length === 0
            ? undefined
            : next.path.trim();
      const model =
        next.model === undefined
          ? prev?.model
          : next.model.trim().length === 0
            ? undefined
            : next.model.trim();
      if (!path && !model) return undefined;
      return { ...(path ? { path } : {}), ...(model ? { model } : {}) };
    }

    const merged: AiIntegrationsConfig = {
      claude: mergeTool(existing.claude, input.claude),
      codex: mergeTool(existing.codex, input.codex),
      aider: mergeTool(existing.aider, input.aider),
      gemini: mergeTool(existing.gemini, input.gemini),
    };

    // Drop undefined tool keys so the persisted JSON only contains tools
    // that actually have overrides — makes the file readable when users
    // poke at it by hand.
    const cleaned: AiIntegrationsConfig = {};
    if (merged.claude) cleaned.claude = merged.claude;
    if (merged.codex) cleaned.codex = merged.codex;
    if (merged.aider) cleaned.aider = merged.aider;
    if (merged.gemini) cleaned.gemini = merged.gemini;

    return saveAiIntegrationsConfig(cleaned);
  });

  // Send a quick sanity-check message using the supplied or stored token.
  // Lets the user verify in one click that the bot can reach their chat.
  app.post('/api/config/telegram/test', async (req, reply) => {
    const parsed = testSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const existing = getTelegramConfigRuntime();
    const token = parsed.data.botToken?.trim() || existing?.botToken || '';
    const chatId = parsed.data.chatId?.trim() || existing?.defaultChatId || '';
    if (!token) return reply.code(400).send({ error: 'no bot token configured' });
    if (!chatId) return reply.code(400).send({ error: 'no chat id configured' });

    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: '✅ BuildPilot test message — Telegram integration is working.',
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: boolean; description?: string }
        | null;
      if (!res.ok || !json?.ok) {
        return reply
          .code(400)
          .send({ ok: false, error: json?.description ?? `HTTP ${res.status}` });
      }
      return { ok: true };
    } catch (err) {
      return reply
        .code(500)
        .send({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });
}
