import { describe, expect, it } from 'vitest';
import { buildResignCommand } from './resign';

describe('buildResignCommand', () => {
  it('builds the canonical Apple Distribution invocation', () => {
    const cmd = buildResignCommand({
      ipaPath: 'build/MyApp.ipa',
      signingIdentity: 'Apple Distribution: Acme Corp (ABC123XYZ4)',
      provisioningProfile: 'signing/AppStore.mobileprovision',
    });
    expect(cmd).toBe(
      `fastlane sigh resign --signing_identity 'Apple Distribution: Acme Corp (ABC123XYZ4)' --provisioning_profile 'signing/AppStore.mobileprovision' 'build/MyApp.ipa'`,
    );
  });

  it('shell-quotes a signingIdentity that contains spaces and parentheses', () => {
    const cmd = buildResignCommand({
      ipaPath: 'a.ipa',
      signingIdentity: 'Apple Distribution: Acme Corp (ABC123XYZ4)',
      provisioningProfile: 'p.mobileprovision',
    });
    expect(cmd).toContain(
      `--signing_identity 'Apple Distribution: Acme Corp (ABC123XYZ4)'`,
    );
  });

  it('includes --bundle_id when bundleId is set', () => {
    const cmd = buildResignCommand({
      ipaPath: 'a.ipa',
      signingIdentity: 'Apple Distribution: Acme Corp (ABC123XYZ4)',
      provisioningProfile: 'p.mobileprovision',
      bundleId: 'com.acme.app',
    });
    expect(cmd).toContain(`--bundle_id 'com.acme.app'`);
  });

  it('includes --display_name when displayName is set', () => {
    const cmd = buildResignCommand({
      ipaPath: 'a.ipa',
      signingIdentity: 'Apple Distribution: Acme Corp (ABC123XYZ4)',
      provisioningProfile: 'p.mobileprovision',
      displayName: 'My White Label App',
    });
    expect(cmd).toContain(`--display_name 'My White Label App'`);
  });

  it('includes --entitlements when entitlements is set', () => {
    const cmd = buildResignCommand({
      ipaPath: 'a.ipa',
      signingIdentity: 'Apple Distribution: Acme Corp (ABC123XYZ4)',
      provisioningProfile: 'p.mobileprovision',
      entitlements: 'signing/MyApp.entitlements',
    });
    expect(cmd).toContain(`--entitlements 'signing/MyApp.entitlements'`);
  });

  it('includes --keychain_path when keychainPath is set', () => {
    const cmd = buildResignCommand({
      ipaPath: 'a.ipa',
      signingIdentity: 'Apple Distribution: Acme Corp (ABC123XYZ4)',
      provisioningProfile: 'p.mobileprovision',
      keychainPath: '/Users/ci/Library/Keychains/build.keychain-db',
    });
    expect(cmd).toContain(
      `--keychain_path '/Users/ci/Library/Keychains/build.keychain-db'`,
    );
  });

  it('appends additionalArgs split on whitespace, each shell-quoted', () => {
    const cmd = buildResignCommand({
      ipaPath: 'a.ipa',
      signingIdentity: 'Apple Distribution: Acme Corp (ABC123XYZ4)',
      provisioningProfile: 'p.mobileprovision',
      additionalArgs: '--verbose --version',
    });
    expect(cmd).toContain(`'--verbose'`);
    expect(cmd).toContain(`'--version'`);
  });

  it('puts the ipa path last as the trailing positional', () => {
    const cmd = buildResignCommand({
      ipaPath: 'build/MyApp.ipa',
      signingIdentity: 'Apple Distribution: Acme Corp (ABC123XYZ4)',
      provisioningProfile: 'p.mobileprovision',
      bundleId: 'com.acme.app',
      additionalArgs: '--verbose',
    });
    expect(cmd.endsWith(`'build/MyApp.ipa'`)).toBe(true);
  });

  it('shell-quotes an ipa path that contains spaces', () => {
    const cmd = buildResignCommand({
      ipaPath: 'build output/My App.ipa',
      signingIdentity: 'Apple Distribution: Acme Corp (ABC123XYZ4)',
      provisioningProfile: 'p.mobileprovision',
    });
    expect(cmd).toContain(`'build output/My App.ipa'`);
  });

  it('throws on missing ipaPath', () => {
    expect(() =>
      buildResignCommand({
        signingIdentity: 'Apple Distribution: Acme Corp (ABC123XYZ4)',
        provisioningProfile: 'p.mobileprovision',
      }),
    ).toThrow(/ipaPath/);
  });

  it('throws on missing signingIdentity', () => {
    expect(() =>
      buildResignCommand({
        ipaPath: 'a.ipa',
        provisioningProfile: 'p.mobileprovision',
      }),
    ).toThrow(/signingIdentity/);
  });

  it('throws on missing provisioningProfile', () => {
    expect(() =>
      buildResignCommand({
        ipaPath: 'a.ipa',
        signingIdentity: 'Apple Distribution: Acme Corp (ABC123XYZ4)',
      }),
    ).toThrow(/provisioningProfile/);
  });

  it('throws when ipaPath is whitespace-only', () => {
    expect(() =>
      buildResignCommand({
        ipaPath: '   ',
        signingIdentity: 'Apple Distribution: Acme Corp (ABC123XYZ4)',
        provisioningProfile: 'p.mobileprovision',
      }),
    ).toThrow(/ipaPath/);
  });
});
