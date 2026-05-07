import { describe, expect, it } from 'vitest';
import { buildFastlaneMatchCommand } from './fastlaneMatch';

describe('buildFastlaneMatchCommand', () => {
  it('builds the canonical readonly appstore invocation', () => {
    const cmd = buildFastlaneMatchCommand({
      matchType: 'appstore',
      appIdentifier: 'com.example.MyGame',
      gitUrl: 'https://github.com/example/match.git',
      gitBranch: 'main',
      readonly: 'true',
    });
    expect(cmd).toBe(
      `fastlane match appstore --app_identifier 'com.example.MyGame' --git_url 'https://github.com/example/match.git' --git_branch 'main' --readonly`,
    );
  });

  it('prefixes MATCH_PASSWORD when password is set', () => {
    const cmd = buildFastlaneMatchCommand({
      matchType: 'development',
      password: 's3cret!',
    });
    expect(cmd.startsWith(`MATCH_PASSWORD='s3cret!' fastlane match development`)).toBe(true);
  });

  it('omits the env prefix when password is empty', () => {
    const cmd = buildFastlaneMatchCommand({ matchType: 'appstore' });
    expect(cmd).not.toContain('MATCH_PASSWORD');
    expect(cmd.startsWith('fastlane match appstore')).toBe(true);
  });

  it('passes keychain name + password through when set', () => {
    const cmd = buildFastlaneMatchCommand({
      matchType: 'appstore',
      keychainName: 'login.keychain-db',
      keychainPassword: 'pw',
    });
    expect(cmd).toContain(`--keychain_name 'login.keychain-db'`);
    expect(cmd).toContain(`--keychain_password 'pw'`);
  });

  it('omits --readonly when readonly is "false"', () => {
    const cmd = buildFastlaneMatchCommand({ matchType: 'appstore', readonly: 'false' });
    expect(cmd).not.toContain('--readonly');
  });

  it('throws on missing matchType', () => {
    expect(() => buildFastlaneMatchCommand({})).toThrow(/matchType/);
  });

  it('throws on an invalid matchType', () => {
    // @ts-expect-error testing the runtime guard
    expect(() => buildFastlaneMatchCommand({ matchType: 'wrongType' })).toThrow(
      /invalid matchType/,
    );
  });

  it('appends additionalArgs split on whitespace, each shell-quoted', () => {
    const cmd = buildFastlaneMatchCommand({
      matchType: 'appstore',
      additionalArgs: '--verbose --skip_confirmation',
    });
    expect(cmd).toContain(`'--verbose'`);
    expect(cmd).toContain(`'--skip_confirmation'`);
  });
});
