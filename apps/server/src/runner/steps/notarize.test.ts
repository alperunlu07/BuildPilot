import { describe, expect, it } from 'vitest';
import { buildNotarizeArgs } from './notarize';
import { buildStapleArgs } from './stapleNotarization';

describe('buildNotarizeArgs', () => {
  it('builds an apiKey-auth invocation with --wait by default', () => {
    const args = buildNotarizeArgs({
      bundlePath: 'build/MyApp.dmg',
      authMethod: 'apiKey',
      apiKeyPath: '~/.appstoreconnect/private_keys/AuthKey_ABC123.p8',
      apiKeyId: 'ABC123',
      apiIssuerId: '57246542-aaaa-bbbb-cccc-ddddeeeeffff',
    });
    // Each path-bearing arg goes through shellQuote, so they're wrapped
    // in single quotes. Asserting on the joined command keeps the test
    // focused on argv assembly without having to re-implement the quoter.
    const cmd = args.join(' ');
    expect(cmd).toContain(`xcrun notarytool submit 'build/MyApp.dmg'`);
    expect(cmd).toContain('--wait');
    expect(cmd).toContain(`--key '~/.appstoreconnect/private_keys/AuthKey_ABC123.p8'`);
    expect(cmd).toContain(`--key-id 'ABC123'`);
    expect(cmd).toContain(`--issuer '57246542-aaaa-bbbb-cccc-ddddeeeeffff'`);
    expect(cmd).not.toContain('--apple-id');
  });

  it('omits --wait when explicitly set to "false"', () => {
    const args = buildNotarizeArgs({
      bundlePath: 'a.dmg',
      authMethod: 'apiKey',
      apiKeyPath: 'k.p8',
      apiKeyId: 'k',
      apiIssuerId: 'i',
      wait: 'false',
    });
    expect(args).not.toContain('--wait');
  });

  it('builds an appleId-auth invocation with the three required flags', () => {
    const args = buildNotarizeArgs({
      bundlePath: 'a.dmg',
      authMethod: 'appleId',
      appleId: 'dev@example.com',
      appPassword: 'xxxx-xxxx-xxxx-xxxx',
      teamId: 'AB12CDE34F',
    });
    const cmd = args.join(' ');
    expect(cmd).toContain(`--apple-id 'dev@example.com'`);
    expect(cmd).toContain(`--password 'xxxx-xxxx-xxxx-xxxx'`);
    expect(cmd).toContain(`--team-id 'AB12CDE34F'`);
    expect(cmd).not.toContain('--key');
  });

  it('throws when apiKey auth is missing any required field', () => {
    expect(() =>
      buildNotarizeArgs({ bundlePath: 'a.dmg', authMethod: 'apiKey' }),
    ).toThrow(/apiKeyPath.*apiKeyId.*apiIssuerId/);
  });

  it('throws when appleId auth is missing teamId', () => {
    expect(() =>
      buildNotarizeArgs({
        bundlePath: 'a.dmg',
        authMethod: 'appleId',
        appleId: 'a',
        appPassword: 'p',
      }),
    ).toThrow(/teamId/);
  });

  it('throws when bundlePath is missing', () => {
    expect(() => buildNotarizeArgs({ authMethod: 'apiKey' })).toThrow(/bundlePath/);
  });

  it('appends additionalArgs split on whitespace and shell-quoted', () => {
    const args = buildNotarizeArgs({
      bundlePath: 'a.dmg',
      authMethod: 'apiKey',
      apiKeyPath: 'k.p8',
      apiKeyId: 'k',
      apiIssuerId: 'i',
      additionalArgs: '--verbose --output-format json',
    });
    const cmd = args.join(' ');
    expect(cmd).toContain(`'--verbose'`);
    expect(cmd).toContain(`'--output-format'`);
    expect(cmd).toContain(`'json'`);
  });
});

describe('buildStapleArgs', () => {
  it('builds the canonical staple command', () => {
    expect(buildStapleArgs({ bundlePath: 'build/MyApp.dmg' })).toEqual([
      'xcrun',
      'stapler',
      'staple',
      `'build/MyApp.dmg'`,
    ]);
  });

  it('throws when bundlePath is missing', () => {
    expect(() => buildStapleArgs({})).toThrow(/bundlePath/);
  });
});
