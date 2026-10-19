import { describe, expect, it, vi } from 'vitest';
import type { TelegramConfig } from '@buildpilot/shared-types';
import { isCommandsOnly, shouldSendApprovalPrompts } from './telegramMode';
import { sendStartupReport } from './startupReport';

const base: TelegramConfig = { enabled: true, botToken: 't', defaultChatId: '1' };

describe('commandsOnly gating', () => {
  it('is off when undefined or false', () => {
    expect(isCommandsOnly(base)).toBe(false);
    expect(isCommandsOnly({ ...base, commandsOnly: false })).toBe(false);
    expect(isCommandsOnly(null)).toBe(false);
  });

  it('suppresses approval prompts only when on', () => {
    expect(shouldSendApprovalPrompts(base)).toBe(true);
    expect(shouldSendApprovalPrompts({ ...base, commandsOnly: true })).toBe(false);
    expect(shouldSendApprovalPrompts(null)).toBe(false);
  });

  it('sendStartupReport sends nothing in commandsOnly mode', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await sendStartupReport(
      { ...base, commandsOnly: true },
      { serverUrl: 'http://127.0.0.1:1', version: 'x' },
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
