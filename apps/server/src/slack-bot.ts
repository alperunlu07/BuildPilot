import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { logger } from './logger';
import { getSlackConfigRuntime } from './config';
import { listPipelines, getPipeline } from './store/pipelines';
import { getProject } from './store/projects';
import { startBuildForPipeline } from './runner/coordinator';

// Slack slash-command receiver — mirrors apps/server/src/runner/telegramBot.ts
// in spirit but lives behind an HTTP endpoint instead of long-polling.
//
// Wire-up: Slack POSTs `application/x-www-form-urlencoded` to
//   /api/integrations/slack/command
// We verify the request against the configured signing secret, then route
// /build /list /help to handlers that match the Telegram bot's command set.

// Slack's published signature scheme — see api.slack.com/authentication/verifying-requests-from-slack.
// Header layout: X-Slack-Request-Timestamp: <unix-secs>, X-Slack-Signature:
//   "v0=<hex(hmacSHA256(signingSecret, `v0:${ts}:${rawBody}`))>".
// Reject anything older than 5 minutes to make replay attacks expensive.
const MAX_SKEW_SEC = 60 * 5;

interface SlackSlashCommandBody {
  token?: string;
  team_id?: string;
  team_domain?: string;
  channel_id?: string;
  channel_name?: string;
  user_id?: string;
  user_name?: string;
  command?: string;
  text?: string;
  response_url?: string;
  trigger_id?: string;
}

// Parse the raw urlencoded body Slack sends. Fastify's default body parser
// already pre-decoded it for us — see configureRawBodyForSlack below.
function asBody(req: FastifyRequest): SlackSlashCommandBody {
  const b = req.body;
  if (!b || typeof b !== 'object') return {};
  return b as SlackSlashCommandBody;
}

function verifySignature(
  signingSecret: string,
  rawBody: string,
  timestamp: string | undefined,
  signature: string | undefined,
): boolean {
  if (!timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > MAX_SKEW_SEC) return false;
  const base = `v0:${timestamp}:${rawBody}`;
  const expected = 'v0=' + createHmac('sha256', signingSecret).update(base).digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Build the response text for /help.
function helpText(): string {
  return [
    '*BuildPilot* slash commands:',
    '• `/build <name>` — start a build for the matching pipeline',
    '• `/list` — list configured pipelines',
    '• `/help` — show this message',
  ].join('\n');
}

function listText(): string {
  const lines = listPipelines().map((p) => {
    const project = getProject(p.projectId);
    return `• *${p.name}* — ${project?.name ?? '?'} (\`${p.watch.branch}\`)`;
  });
  return lines.length > 0 ? lines.join('\n') : 'No pipelines configured.';
}

async function handleBuild(rawArgs: string): Promise<string> {
  const all = listPipelines();
  if (all.length === 0) return 'No pipelines configured.';
  const needle = rawArgs.trim().toLowerCase();
  if (!needle) {
    return `Usage: \`/build <name>\`. Try \`/list\` for the available pipelines.`;
  }
  const matches = all.filter((p) => p.name.toLowerCase().includes(needle));
  if (matches.length === 0) return `No pipeline matched \`${needle}\`.`;
  if (matches.length > 1) {
    return [
      `Multiple matches — refine the name:`,
      ...matches.map((p) => `• \`${p.name}\``),
    ].join('\n');
  }
  const p = matches[0]!;
  const build = await startBuildForPipeline(p.id);
  return build
    ? `:rocket: Build started for *${p.name}* — \`${build.id.slice(0, 8)}\``
    : `Could not start a build for *${p.name}*.`;
}

// Returns the text to send back synchronously. Slack expects a JSON body of
// shape `{ response_type: 'ephemeral' | 'in_channel', text: string }`. We
// default to ephemeral so a public channel doesn't get spammed by a
// throwaway /help.
async function dispatch(body: SlackSlashCommandBody): Promise<{
  response_type: 'ephemeral' | 'in_channel';
  text: string;
}> {
  const cmd = (body.command ?? '').toLowerCase().trim();
  const text = (body.text ?? '').trim();
  if (cmd === '/help' || cmd === '/buildpilot-help') {
    return { response_type: 'ephemeral', text: helpText() };
  }
  if (cmd === '/list' || cmd === '/buildpilot-list') {
    return { response_type: 'ephemeral', text: listText() };
  }
  if (cmd === '/build' || cmd === '/buildpilot-build') {
    const reply = await handleBuild(text);
    return { response_type: 'in_channel', text: reply };
  }
  return {
    response_type: 'ephemeral',
    text: `Unknown command \`${cmd}\`. Try \`/help\`.`,
  };
}

// Lazy lookup of the configured pipeline so callers can pre-resolve the
// pipeline id from an interactive button callback. Currently unused but
// kept for parity with the Telegram approval flow.
export function getSlackPipelineHint(pipelineId: string) {
  return getPipeline(pipelineId);
}

// We need the raw body string to compute the HMAC, but Fastify decodes
// application/x-www-form-urlencoded into an object by default. Register a
// content-type parser that keeps the raw text on req.rawBody while still
// surfacing a parsed object on req.body.
export function registerSlackParser(app: FastifyInstance): void {
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_req, body, done) => {
      try {
        const raw = typeof body === 'string' ? body : body.toString('utf-8');
        const params = new URLSearchParams(raw);
        const out: Record<string, string> = {};
        for (const [k, v] of params) out[k] = v;
        // Stash the raw body so the signature verifier can read it.
        // Fastify keeps arbitrary props on the request object; we use a
        // symbol-ish name to avoid collisions with the framework.
        (_req as unknown as { _slackRawBody: string })._slackRawBody = raw;
        done(null, out);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );
}

export async function slackBotRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/integrations/slack/command', async (req, reply) => {
    const cfg = getSlackConfigRuntime();
    if (!cfg || !cfg.enabled) {
      return reply.code(503).send({ error: 'slack integration disabled' });
    }
    if (!cfg.signingSecret) {
      return reply.code(503).send({ error: 'slack signing secret not configured' });
    }
    const raw = (req as unknown as { _slackRawBody?: string })._slackRawBody ?? '';
    const ts = req.headers['x-slack-request-timestamp'];
    const sig = req.headers['x-slack-signature'];
    const ok = verifySignature(
      cfg.signingSecret,
      raw,
      Array.isArray(ts) ? ts[0] : ts,
      Array.isArray(sig) ? sig[0] : sig,
    );
    if (!ok) {
      logger.warn(
        { ip: req.ip, ts, hasSig: Boolean(sig) },
        'slack: signature verification failed',
      );
      return reply.code(401).send({ error: 'bad signature' });
    }

    const body = asBody(req);
    logger.info(
      { command: body.command, user: body.user_name, channel: body.channel_name },
      'slack: slash command received',
    );

    const result = await dispatch(body).catch((err) => {
      logger.warn({ err: String(err) }, 'slack: dispatch failed');
      return {
        response_type: 'ephemeral' as const,
        text: `Internal error: ${err instanceof Error ? err.message : String(err)}`,
      };
    });
    return reply.send(result);
  });
}
