import { describe, expect, it } from 'vitest';
import { CFBUNDLE_VERSION_KEY, buildPlistBuddyCommand } from './_plist';

describe('buildPlistBuddyCommand', () => {
  it('quotes inner command and path', () => {
    expect(buildPlistBuddyCommand('Set :CFBundleVersion 42', 'Info.plist')).toBe(
      `/usr/libexec/PlistBuddy -c 'Set :CFBundleVersion 42' 'Info.plist'`,
    );
  });

  it('handles paths with spaces', () => {
    expect(buildPlistBuddyCommand('Print :CFBundleVersion', 'My App/Info.plist')).toBe(
      `/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' 'My App/Info.plist'`,
    );
  });

  it('exposes the canonical CFBundleVersion key', () => {
    expect(CFBUNDLE_VERSION_KEY).toBe(':CFBundleVersion');
  });
});
