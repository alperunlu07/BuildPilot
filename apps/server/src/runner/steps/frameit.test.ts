import { describe, expect, it } from 'vitest';
import { buildFrameitCommand } from './frameit';

describe('buildFrameitCommand', () => {
  it('defaults to plain `fastlane frameit ./screenshots` with no fields', () => {
    expect(buildFrameitCommand({})).toBe(`fastlane frameit './screenshots'`);
  });

  it('honors a custom pathToScreenshots', () => {
    expect(
      buildFrameitCommand({ pathToScreenshots: 'fastlane/screenshots/en-US' }),
    ).toBe(`fastlane frameit 'fastlane/screenshots/en-US'`);
  });

  it('emits --silver when colorFlag="silver"', () => {
    expect(buildFrameitCommand({ colorFlag: 'silver' })).toBe(
      `fastlane frameit --silver './screenshots'`,
    );
  });

  it('emits --gold when colorFlag="gold"', () => {
    expect(buildFrameitCommand({ colorFlag: 'gold' })).toContain('--gold');
  });

  it('maps space-gray → --space_gray', () => {
    expect(buildFrameitCommand({ colorFlag: 'space-gray' })).toContain('--space_gray');
  });

  it('maps rose-gold → --rose_gold', () => {
    expect(buildFrameitCommand({ colorFlag: 'rose-gold' })).toContain('--rose_gold');
  });

  it('omits any color flag when colorFlag="none"', () => {
    const cmd = buildFrameitCommand({ colorFlag: 'none' });
    expect(cmd).not.toContain('--silver');
    expect(cmd).not.toContain('--gold');
    expect(cmd).not.toContain('--rose_gold');
    expect(cmd).not.toContain('--space_gray');
  });

  it('adds --force when force="true"', () => {
    expect(buildFrameitCommand({ force: 'true' })).toContain('--force');
  });

  it('omits --force by default', () => {
    expect(buildFrameitCommand({})).not.toContain('--force');
  });

  it('adds --use_legacy_iphone5s when useLegacyIphone5s="true"', () => {
    expect(buildFrameitCommand({ useLegacyIphone5s: 'true' })).toContain(
      '--use_legacy_iphone5s',
    );
  });

  it('passes usePlatform through as --use_platform <X> shell-quoted', () => {
    expect(buildFrameitCommand({ usePlatform: 'IOS' })).toContain(`--use_platform 'IOS'`);
  });

  it('throws on an invalid colorFlag', () => {
    expect(() =>
      // @ts-expect-error testing the runtime guard
      buildFrameitCommand({ colorFlag: 'magenta' }),
    ).toThrow(/invalid colorFlag/);
  });

  it('appends additionalArgs split on whitespace, each shell-quoted', () => {
    const cmd = buildFrameitCommand({ additionalArgs: '--verbose --debug' });
    expect(cmd).toContain(`'--verbose'`);
    expect(cmd).toContain(`'--debug'`);
  });

  it('combines silver + force + path in the documented order', () => {
    expect(
      buildFrameitCommand({
        colorFlag: 'silver',
        force: 'true',
        pathToScreenshots: 'screenshots',
      }),
    ).toBe(`fastlane frameit --silver --force 'screenshots'`);
  });
});
