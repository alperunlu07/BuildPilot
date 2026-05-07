import { describe, expect, it } from 'vitest';
import { buildIncrementBuildNumberCommand } from './incrementBuildNumber';

describe('buildIncrementBuildNumberCommand', () => {
  it('defaults to agvtool next-version when no versionString is set', () => {
    expect(buildIncrementBuildNumberCommand({})).toBe('xcrun agvtool next-version -all');
  });

  it('emits agvtool new-version with shell-quoted value when versionString is set', () => {
    expect(
      buildIncrementBuildNumberCommand({ mode: 'agvtool', versionString: '42' }),
    ).toBe(`xcrun agvtool new-version -all '42'`);
  });

  it('emits PlistBuddy Set :CFBundleVersion with quoted plist path', () => {
    expect(
      buildIncrementBuildNumberCommand({
        mode: 'plistBuddy',
        versionString: '99',
        plistPath: 'MyApp/Info.plist',
      }),
    ).toBe(`/usr/libexec/PlistBuddy -c 'Set :CFBundleVersion 99' 'MyApp/Info.plist'`);
  });

  it('throws when plistBuddy mode is missing plistPath', () => {
    expect(() =>
      buildIncrementBuildNumberCommand({ mode: 'plistBuddy', versionString: '1' }),
    ).toThrow(/plistPath/);
  });

  it('throws when plistBuddy mode is missing versionString', () => {
    expect(() =>
      buildIncrementBuildNumberCommand({ mode: 'plistBuddy', plistPath: 'Info.plist' }),
    ).toThrow(/versionString/);
  });

  it('throws on an invalid mode', () => {
    // @ts-expect-error testing the runtime guard
    expect(() => buildIncrementBuildNumberCommand({ mode: 'bogus' })).toThrow(/invalid mode/);
  });
});
