import type { TelegramConfig } from '@buildpilot/shared-types';
import { logger } from '../logger';
import { startBuildForPipeline } from './coordinator';
import { getPipeline, listPipelines } from '../store/pipelines';
import { getProject } from '../store/projects';

interface TelegramUpdate {
  update_id: number;
  message?: {
    chat: { id: number };
    text?: string;
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat: { id: number }; message_id: number; text?: string };
    from: { username?: string; first_name?: string };
  };
}

interface BotState {
  config: TelegramConfig;
  stopped: boolean;
}

let state: BotState | null = null;

export function getTelegramConfig(): TelegramConfig | null {
  if (!state || !state.config.enabled || !state.config.botToken) return null;
  return state.config;
}

export function isTelegramEnabled(): boolean {
  return Boolean(state && state.config.enabled && state.config.botToken);
}

export function startTelegramBot(config: TelegramConfig): void {
  if (state) stopTelegramBot();
  if (!config.enabled || !config.botToken) {
    logger.info('telegram bot disabled (no token)');
    return;
  }
  state = { config, stopped: false };
  logger.info('telegram bot polling for updates');
  void pollLoop();
}

export function stopTelegramBot(): void {
  if (state) state.stopped = true;
  state = null;
}

async function pollLoop(): Promise<void> {
  if (!state) return;
  let offset = 0;
  while (!state.stopped) {
    try {
      const url = `https://api.telegram.org/bot${state.config.botToken}/getUpdates?offset=${offset}&timeout=30`;
      const res = await fetch(url);
      if (!res.ok) {
        logger.warn({ status: res.status }, 'telegram getUpdates non-200');
        await sleep(5000);
        continue;
      }
      const data = (await res.json()) as { ok: boolean; result?: TelegramUpdate[] };
      if (!data.ok || !Array.isArray(data.result)) {
        await sleep(2000);
        continue;
      }
      for (const upd of data.result) {
        offset = upd.update_id + 1;
        await handleUpdate(upd).catch((err) =>
          logger.warn({ err: String(err) }, 'telegram update handler failed'),
        );
      }
    } catch (err) {
      logger.warn({ err: String(err) }, 'telegram poll error, retrying in 5s');
      await sleep(5000);
    }
  }
}

async function handleUpdate(upd: TelegramUpdate): Promise<void> {
  if (upd.callback_query) {
    await handleCallback(upd.callback_query);
    return;
  }
  if (upd.message) {
    const chatId = upd.message.chat.id;
    const text = upd.message.text ?? '';
    logger.info({ chatId, text: text.slice(0, 60) }, 'telegram inbound message');
    if (text.startsWith('/')) {
      await handleCommand(chatId, text);
    }
  }
}

// Authorize commands against the configured defaultChatId. Anyone else gets
// no response — silent ignore avoids advertising the bot to randoms.
function isAuthorized(chatId: number): boolean {
  if (!state) return false;
  const allowed = state.config.defaultChatId?.trim();
  if (!allowed) return false;
  return String(chatId) === allowed;
}

async function handleCommand(chatId: number, text: string): Promise<void> {
  if (!isAuthorized(chatId)) {
    logger.warn({ chatId }, 'telegram command from unauthorized chat — ignored');
    return;
  }
  // Strip @BotName suffix Telegram appends in groups: "/build@PFBuildPilot_bot"
  const [rawCmd, ...args] = text.trim().split(/\s+/);
  const cmd = (rawCmd ?? '').split('@')[0]?.toLowerCase() ?? '';

  if (cmd === '/start' || cmd === '/help') {
    await sendChatMessage(
      chatId,
      [
        '<b>BuildPilot</b> — commands:',
        '',
        '<code>/list</code> — list pipelines',
        '<code>/build</code> — send a button menu to pick a pipeline',
        '<code>/build &lt;name&gt;</code> — run the matching pipeline',
        '<code>/help</code> — this help',
      ].join('\n'),
    );
    return;
  }

  if (cmd === '/list') {
    const lines = listPipelines().map((p) => {
      const project = getProject(p.projectId);
      return `• <b>${escapeHtml(p.name)}</b> — ${escapeHtml(project?.name ?? '?')} · <code>${escapeHtml(p.watch.branch)}</code>`;
    });
    await sendChatMessage(
      chatId,
      lines.length > 0 ? lines.join('\n') : 'No pipelines configured.',
    );
    return;
  }

  if (cmd === '/build') {
    const all = listPipelines();
    if (all.length === 0) {
      await sendChatMessage(chatId, 'No pipelines configured.');
      return;
    }
    if (args.length > 0) {
      const needle = args.join(' ').toLowerCase();
      const matches = all.filter((p) => p.name.toLowerCase().includes(needle));
      if (matches.length === 0) {
        await sendChatMessage(chatId, `No pipeline matched <code>${escapeHtml(needle)}</code>.`);
        return;
      }
      if (matches.length > 1) {
        const list = matches
          .map((p) => `• <code>${escapeHtml(p.name)}</code>`)
          .join('\n');
        await sendChatMessage(
          chatId,
          `Multiple matches — refine name:\n${list}`,
        );
        return;
      }
      const p = matches[0]!;
      const build = await startBuildForPipeline(p.id);
      await sendChatMessage(
        chatId,
        build
          ? `🚀 Build started for <b>${escapeHtml(p.name)}</b> — <code>${build.id.slice(0, 8)}</code>`
          : `Could not start build for <b>${escapeHtml(p.name)}</b>.`,
      );
      return;
    }
    // No args: show picker. callback_data shape ("build:<pipelineId>")
    // matches the existing handleCallback so no separate handler needed.
    await sendChatMessage(chatId, 'Pick a pipeline to build:', {
      inline_keyboard: all.map((p) => [
        { text: p.name, callback_data: `build:${p.id}` },
      ]),
    });
    return;
  }

  await sendChatMessage(
    chatId,
    `Unknown command. Try <code>/help</code>.`,
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function sendChatMessage(
  chatId: number | string,
  text: string,
  replyMarkup?: Record<string, unknown>,
): Promise<void> {
  if (!state) return;
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
  };
  if (replyMarkup) body.reply_markup = replyMarkup;
  await fetch(`https://api.telegram.org/bot${state.config.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch((err) => logger.warn({ err: String(err) }, 'telegram sendChatMessage failed'));
}

async function handleCallback(cb: NonNullable<TelegramUpdate['callback_query']>): Promise<void> {
  const data = cb.data ?? '';
  // Encoded as "build:<pipelineId>" or "skip:<pipelineId>"
  const [action, pipelineId] = data.split(':');
  if (!action || !pipelineId) {
    await answerCallback(cb.id, 'Unknown action');
    return;
  }
  const pipeline = getPipeline(pipelineId);
  if (!pipeline) {
    await answerCallback(cb.id, 'Pipeline no longer exists');
    return;
  }
  const project = getProject(pipeline.projectId);
  const who = cb.from.username ? `@${cb.from.username}` : cb.from.first_name ?? 'someone';

  if (action === 'build') {
    const build = await startBuildForPipeline(pipelineId);
    await answerCallback(cb.id, build ? '🚀 Build started' : 'Could not start build');
    if (cb.message) {
      const orig = cb.message.text ?? '';
      await editMessage(
        cb.message.chat.id,
        cb.message.message_id,
        `${orig}\n\n✅ <b>${who}</b> approved → build ${build?.id.slice(0, 8) ?? '?'} started`,
      );
    }
    logger.info({ pipelineId, project: project?.name, by: who }, 'telegram build approved');
  } else if (action === 'skip') {
    await answerCallback(cb.id, 'Skipped');
    if (cb.message) {
      const orig = cb.message.text ?? '';
      await editMessage(
        cb.message.chat.id,
        cb.message.message_id,
        `${orig}\n\n⏭ <b>${who}</b> skipped`,
      );
    }
    logger.info({ pipelineId, project: project?.name, by: who }, 'telegram build skipped');
  } else {
    await answerCallback(cb.id, `Unknown action: ${action}`);
  }
}

async function answerCallback(id: string, text: string): Promise<void> {
  if (!state) return;
  await fetch(`https://api.telegram.org/bot${state.config.botToken}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: id, text }),
  }).catch(() => null);
}

async function editMessage(chatId: number, messageId: number, text: string): Promise<void> {
  if (!state) return;
  await fetch(`https://api.telegram.org/bot${state.config.botToken}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [] },
    }),
  }).catch(() => null);
}

// Send a build-approval prompt with two inline buttons. Used by the poller
// when a pipeline has telegramApprovals enabled and the watched branch
// advances.
export async function sendApprovalRequest(opts: {
  chatId: string;
  pipelineId: string;
  text: string;
}): Promise<void> {
  if (!state) return;
  await fetch(`https://api.telegram.org/bot${state.config.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: opts.chatId,
      text: opts.text,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Build', callback_data: `build:${opts.pipelineId}` },
            { text: '⏭ Skip', callback_data: `skip:${opts.pipelineId}` },
          ],
        ],
      },
    }),
  }).catch((err) => logger.warn({ err: String(err) }, 'telegram sendApprovalRequest failed'));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
