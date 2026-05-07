import { describe, expect, it } from 'vitest';
import { buildXcodeSelectArgs } from './xcodeSelect';

describe('buildXcodeSelectArgs', () => {
  it('builds the canonical sudo xcode-select invocation', () => {
    expect(buildXcodeSelectArgs({ xcodePath: '/Applications/Xcode_15.4.app' })).toEqual([
      'sudo',
      'xcode-select',
      '-s',
      `'/Applications/Xcode_15.4.app'`,
    ]);
  });

  it('shell-quotes paths with spaces', () => {
    const args = buildXcodeSelectArgs({ xcodePath: '/Applications/Xcode 15.4.app' });
    expect(args[3]).toBe(`'/Applications/Xcode 15.4.app'`);
  });

  it('throws when xcodePath is missing', () => {
    expect(() => buildXcodeSelectArgs({})).toThrow(/xcodePath/);
  });

  it('throws when xcodePath is empty/whitespace', () => {
    expect(() => buildXcodeSelectArgs({ xcodePath: '   ' })).toThrow(/xcodePath/);
  });
});
