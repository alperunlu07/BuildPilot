import type { TelegramConfig } from '@buildpilot/shared-types';

// Commands-only mode (TelegramConfig.commandsOnly): the bot answers commands
// and reports builds started from Telegram, but never speaks first. These
// helpers are the single place the unsolicited senders consult.

export function isCommandsOnly(cfg: TelegramConfig | null | undefined): boolean {
  return cfg?.commandsOnly === true;
}

// New-commit approval prompts (poller) are unsolicited.
export function shouldSendApprovalPrompts(cfg: TelegramConfig | null | undefined): boolean {
  return Boolean(cfg) && !isCommandsOnly(cfg);
}
