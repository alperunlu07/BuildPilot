import { describe, expect, it } from 'vitest';
import { buildSwiftlintCommand } from './swiftlint';

describe('buildSwiftlintCommand', () => {
  it('defaults to plain `swiftlint lint` with no flags', () => {
    expect(buildSwiftlintCommand({})).toBe('swiftlint lint');
  });

  it('appends paths split on newlines and shell-quoted', () => {
    expect(
      buildSwiftlintCommand({ paths: 'Sources\nTests' }),
    ).toBe(`swiftlint lint 'Sources' 'Tests'`);
  });

  it('drops empty / whitespace-only path lines', () => {
    expect(
      buildSwiftlintCommand({ paths: 'Sources\n\n  \nTests' }),
    ).toBe(`swiftlint lint 'Sources' 'Tests'`);
  });

  it('emits --config <file> when configFile is set', () => {
    expect(
      buildSwiftlintCommand({ configFile: '.swiftlint.yml' }),
    ).toBe(`swiftlint lint --config '.swiftlint.yml'`);
  });

  it('adds --strict when strict="true"', () => {
    expect(buildSwiftlintCommand({ strict: 'true' })).toBe('swiftlint lint --strict');
  });

  it('emits --reporter <r> when reporter is overridden', () => {
    expect(
      buildSwiftlintCommand({ reporter: 'junit' }),
    ).toBe('swiftlint lint --reporter junit');
  });

  it('omits --reporter when reporter is the default "xcode"', () => {
    expect(buildSwiftlintCommand({ reporter: 'xcode' })).toBe('swiftlint lint');
  });

  it('adds --quiet when quiet="true"', () => {
    expect(buildSwiftlintCommand({ quiet: 'true' })).toBe('swiftlint lint --quiet');
  });

  it('uses --fix (no subcommand) for fix mode', () => {
    expect(buildSwiftlintCommand({ mode: 'fix' })).toBe('swiftlint --fix');
  });

  it('uses the analyze subcommand for analyze mode', () => {
    expect(buildSwiftlintCommand({ mode: 'analyze' })).toBe('swiftlint analyze');
  });

  it('combines flags + paths in a stable order', () => {
    expect(
      buildSwiftlintCommand({
        configFile: '.swiftlint.yml',
        reporter: 'junit',
        strict: 'true',
        paths: 'Sources\nTests',
      }),
    ).toBe(`swiftlint lint --config '.swiftlint.yml' --reporter junit --strict 'Sources' 'Tests'`);
  });

  it('throws on an invalid mode', () => {
    // @ts-expect-error testing the runtime guard
    expect(() => buildSwiftlintCommand({ mode: 'bogus' })).toThrow(/invalid mode/);
  });

  it('throws on an invalid reporter', () => {
    // @ts-expect-error testing the runtime guard
    expect(() => buildSwiftlintCommand({ reporter: 'bogus' })).toThrow(/invalid reporter/);
  });
});
