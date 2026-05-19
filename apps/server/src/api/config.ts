import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  DiscordConfig,
  DiscordConfigPublic,
  SlackConfig,
  SlackConfigPublic,
  TelegramConfig,
  TelegramConfigPublic,
} from '@buildpilot/shared-types';
import {
  getDiscordConfigRuntime,
  getSlackConfigRuntime,
  getTelegramConfigRuntime,
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
