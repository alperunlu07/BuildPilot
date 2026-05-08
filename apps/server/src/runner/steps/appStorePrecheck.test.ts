import { describe, expect, it } from 'vitest';
import { buildAppStorePrecheckCommand } from './appStorePrecheck';

describe('buildAppStorePrecheckCommand', () => {
  it('builds the canonical fastlane precheck invocation', () => {
    const cmd = buildAppStorePrecheckCommand({ appIdentifier: 'com.example.app' });
    expect(cmd).toBe(`fastlane precheck --app_identifier 'com.example.app'`);
  });

  it('appends optional flags', () => {
    const cmd = buildAppStorePrecheckCommand({
      appIdentifier: 'com.example.app',
      username: 'dev@example.com',
      teamId: 'AB12CDE34F',
      includeInAppPurchases: 'true',
      defaultRule: 'warn',
    });
    expect(cmd).toContain(`--username 'dev@example.com'`);
    expect(cmd).toContain(`--team_id 'AB12CDE34F'`);
    expect(cmd).toContain(`--include_in_app_purchases true`);
    expect(cmd).toContain(`--default_rule_level 'warn'`);
  });

  it('throws on missing appIdentifier', () => {
    expect(() => buildAppStorePrecheckCommand({})).toThrow(/appIdentifier/);
  });

  it('appends additionalArgs verbatim (whitespace-split + shell-quoted)', () => {
    const cmd = buildAppStorePrecheckCommand({
      appIdentifier: 'a',
      additionalArgs: '--free_stuff_in_iap true',
    });
    expect(cmd).toMatch(/'--free_stuff_in_iap'\s+'true'/);
  });
});
