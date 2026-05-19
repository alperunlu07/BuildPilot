import { verify } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { logger } from './logger';
import { getDiscordConfigRuntime } from './config';
import { listPipelines } from './store/pipelines';
import { getProject } from './store/projects';
import { startBuildForPipeline } from './runner/coordinator';

// Discord slash-command receiver — mirrors the Slack bot. Discord posts the
// interaction as a JSON body to a single registered endpoint and requires
// Ed25519 verification against the public key from the Developer Portal.
//
// We deliberately do NOT pull in discord.js or @discordjs/* — too heavy for
// what amounts to "verify a signature and echo a string back". The
// verification uses Node's built-in `crypto.verify('ed25519', …)` so there's
// no extra dependency.
//
// Slash command registration is a separate one-shot step (apps/server/scripts/
// register-discord-commands.ts) — see the README footnote. Registering on
// every server boot was rejected to avoid accidental duplicate registrations.

// Discord InteractionType enum (developer docs).
const INTERACTION_PING = 1;
const INTERACTION_APPLICATION_COMMAND = 2;

// InteractionResponseType enum.
const RESPONSE_PONG = 1;
const RESPONSE_CHANNEL_MESSAGE_WITH_SOURCE = 4;

// Discord interaction payload — only the shape we care about.
interface DiscordInteraction {
  type: number;
  data?: {
    name?: string;
    options?: Array<{ name?: string; value?: string | number | boolean }>;
  };
  member?: { user?: { id?: string; username?: string } };
  user?: { id?: string; username?: string };
}

// Verify the Ed25519 signature Discord attaches to every interaction.
// Per docs the signed payload is `timestamp + rawBody` and the public key is
// hex-encoded.
function verifyDiscordSignature(
  publicKeyHex: string,
  signatureHex: string | undefined,
  timestamp: string | undefined,
  rawBody: string,
): boolean {
  if (!signatureHex || !timestamp) return false;
  let sig: Buffer;
  let pub: Buffer;
  try {
    sig = Buffer.from(signatureHex, 'hex');
    pub = Buffer.from(publicKeyHex, 'hex');
  } catch {
    return false;
  }
  if (sig.length !== 64 || pub.length !== 32) return false;
  // Wrap the raw 32-byte key into an Ed25519 SPKI DER blob so KeyObject can
  // consume it without an external library. The DER prefix is fixed for
  // Ed25519 public keys (RFC 8410): SEQUENCE { SEQUENCE { OID(Ed25519) }
  // BIT STRING { 0x00 <key> } }.
  const der = Buffer.concat([
    Buffer.from('302a300506032b6570032100', 'hex'),
    pub,
  ]);
  const message = Buffer.concat([Buffer.from(timestamp, 'utf-8'), Buffer.from(rawBody, 'utf-8')]);
  try {
    return verify(
      null,
      message,
      { key: der, format: 'der', type: 'spki' },
      sig,
    );
  } catch (err) {
    logger.warn({ err: String(err) }, 'discord: signature verify threw');
    return false;
  }
}

function helpEmbed(): string {
  return [
    '**BuildPilot commands**',
    '• `/build name:<pipeline>` — start a build',
    '• `/list` — list configured pipelines',
    '• `/help` — show this message',
  ].join('\n');
}

function listEmbed(): string {
  const lines = listPipelines().map((p) => {
    const project = getProject(p.projectId);
    return `• **${p.name}** — ${project?.name ?? '?'} (\`${p.watch.branch}\`)`;
  });
  return lines.length > 0 ? lines.join('\n') : 'No pipelines configured.';
}

async function handleBuild(rawName: string): Promise<string> {
  const all = listPipelines();
  if (all.length === 0) return 'No pipelines configured.';
  const needle = rawName.trim().toLowerCase();
  if (!needle) {
    return 'Usage: `/build name:<pipeline>`. Try `/list` for the available pipelines.';
  }
  const matches = all.filter((p) => p.name.toLowerCase().includes(needle));
  if (matches.length === 0) return `No pipeline matched \`${needle}\`.`;
  if (matches.length > 1) {
    return [
      'Multiple matches — refine the name:',
      ...matches.map((p) => `• \`${p.name}\``),
    ].join('\n');
  }
  const p = matches[0]!;
  const build = await startBuildForPipeline(p.id);
  return build
    ? `:rocket: Build started for **${p.name}** — \`${build.id.slice(0, 8)}\``
    : `Could not start a build for **${p.name}**.`;
}

// Map a slash-command invocation to the reply text. We deliberately mirror
// the Slack bot's command set so users get identical UX whichever channel
// they're in.
async function dispatch(interaction: DiscordInteraction): Promise<string> {
  const name = interaction.data?.name?.toLowerCase() ?? '';
  if (name === 'help' || name === 'buildpilot-help') return helpEmbed();
  if (name === 'list' || name === 'buildpilot-list') return listEmbed();
  if (name === 'build' || name === 'buildpilot-build') {
    const opt = interaction.data?.options?.find((o) => o.name === 'name');
    return await handleBuild(String(opt?.value ?? ''));
  }
  return `Unknown command \`${name}\`. Try \`/help\`.`;
}

// Like Slack, we need the raw body string for signature verification. Add a
// JSON parser variant that preserves the raw text on the request.
function registerDiscordParser(app: FastifyInstance): void {
  // Discord posts application/json. We can't use Fastify's default JSON
  // parser because it discards the raw body. Re-register it as the same
  // content type with parseAs: 'string' and parse manually.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body, done) => {
      try {
        const raw = typeof body === 'string' ? body : body.toString('utf-8');
        (_req as unknown as { _discordRawBody: string })._discordRawBody = raw;
        const parsed = raw.length > 0 ? JSON.parse(raw) : {};
        done(null, parsed);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );
}

let parserRegistered = false;

export async function discordBotRoutes(app: FastifyInstance): Promise<void> {
  if (!parserRegistered) {
    registerDiscordParser(app);
    parserRegistered = true;
  }

  app.post('/api/integrations/discord/interactions', async (req, reply) => {
    const cfg = getDiscordConfigRuntime();
    if (!cfg || !cfg.enabled) {
      return reply.code(503).send({ error: 'discord integration disabled' });
    }
    if (!cfg.publicKey) {
      return reply.code(503).send({ error: 'discord public key not configured' });
    }
    const raw = (req as unknown as { _discordRawBody?: string })._discordRawBody ?? '';
    const sig = req.headers['x-signature-ed25519'];
    const ts = req.headers['x-signature-timestamp'];
    const ok = verifyDiscordSignature(
      cfg.publicKey,
      Array.isArray(sig) ? sig[0] : sig,
      Array.isArray(ts) ? ts[0] : ts,
      raw,
    );
    if (!ok) {
      logger.warn({ ip: req.ip }, 'discord: signature verification failed');
      return reply.code(401).send({ error: 'bad signature' });
    }

    const interaction = (req.body ?? {}) as DiscordInteraction;
    // Type 1 (PING) is Discord's "are you alive" probe sent both when
    // registering the interactions URL and periodically afterwards. Reply
    // with a PONG (type 1) — anything else and Discord will mark the
    // endpoint as broken.
    if (interaction.type === INTERACTION_PING) {
      return reply.send({ type: RESPONSE_PONG });
    }
    if (interaction.type !== INTERACTION_APPLICATION_COMMAND) {
      return reply.code(400).send({ error: 'unsupported interaction type' });
    }

    const text = await dispatch(interaction).catch((err) => {
      logger.warn({ err: String(err) }, 'discord: dispatch failed');
      return `Internal error: ${err instanceof Error ? err.message : String(err)}`;
    });
    logger.info(
      { command: interaction.data?.name, user: interaction.member?.user?.username ?? interaction.user?.username },
      'discord: command handled',
    );
    return reply.send({
      type: RESPONSE_CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: text },
    });
  });
}

// Helper exported for tests so we can exercise verify path without going
// through Fastify.
export const _internal = { verifyDiscordSignature, dispatch };
