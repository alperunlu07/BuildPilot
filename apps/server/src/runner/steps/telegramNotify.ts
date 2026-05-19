import type { TelegramNotifyStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { getTelegramConfig } from '../telegramBot';
import { suppressForMatrixSummary } from './_matrixGuard';

function asBool(v: unknown): boolean {
  return v === true || v === 'true';
}

export async function runTelegramNotify(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<TelegramNotifyStepData>;
  const cfg = getTelegramConfig();

  const botToken =
    d.botToken && d.botToken.trim().length > 0 ? d.botToken : cfg?.botToken;
  const chatId =
    d.chatId && d.chatId.trim().length > 0 ? d.chatId : cfg?.defaultChatId;

  if (!botToken) {
    throw new Error(
      'telegramNotify: no bot token (set in step or in ~/.buildpilot/config.json telegram.botToken)',
    );
  }
  if (!chatId) {
    throw new Error(
      'telegramNotify: no chat id (set in step or in ~/.buildpilot/config.json telegram.defaultChatId)',
    );
  }
  if (!d.text || d.text.trim().length === 0) {
    throw new Error('telegramNotify: missing "text"');
  }

  if (suppressForMatrixSummary(ctx)) {
    ctx.log('telegramNotify: skipped (matrix child — parent will send rolled-up summary)');
    return;
  }

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: d.text,
    disable_notification: asBool(d.silent),
  };
  if (d.parseMode && d.parseMode !== 'plain') body.parse_mode = d.parseMode;

  ctx.log(`telegram → chat ${maskChatId(String(chatId))}`);
  ctx.log(d.text, 'stdout');

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as
    | { ok: boolean; description?: string }
    | null;
  if (!res.ok || !json?.ok) {
    throw new Error(
      `telegram returned ${res.status}: ${json?.description ?? 'unknown error'}`,
    );
  }
}

function maskChatId(s: string): string {
  if (s.startsWith('@')) return s;
  if (s.length <= 4) return s;
  return `${s.slice(0, 2)}…${s.slice(-2)}`;
}
