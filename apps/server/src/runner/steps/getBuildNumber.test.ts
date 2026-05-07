import { describe, expect, it } from 'vitest';
import { buildGetBuildNumberCommand } from './getBuildNumber';

describe('buildGetBuildNumberCommand', () => {
  it('defaults to agvtool what-version -terse', () => {
    expect(buildGetBuildNumberCommand({})).toBe('xcrun agvtool what-version -terse');
  });

  it('emits PlistBuddy Print :CFBundleVersion with quoted plist path', () => {
    expect(
      buildGetBuildNumberCommand({ mode: 'plistBuddy', plistPath: 'MyApp/Info.plist' }),
    ).toBe(`/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' 'MyApp/Info.plist'`);
  });

  it('throws when plistBuddy mode is missing plistPath', () => {
    expect(() => buildGetBuildNumberCommand({ mode: 'plistBuddy' })).toThrow(/plistPath/);
  });

  it('throws on an invalid mode', () => {
    // @ts-expect-error testing the runtime guard
    expect(() => buildGetBuildNumberCommand({ mode: 'bogus' })).toThrow(/invalid mode/);
  });
});
