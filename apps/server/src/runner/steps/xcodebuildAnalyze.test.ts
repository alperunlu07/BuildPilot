import { describe, expect, it } from 'vitest';
import { buildXcodebuildAnalyzeArgs } from './xcodebuildAnalyze';

describe('buildXcodebuildAnalyzeArgs', () => {
  it('produces a canonical workspace + scheme invocation', () => {
    const args = buildXcodebuildAnalyzeArgs({
      workspacePath: 'X.xcworkspace',
      scheme: 'A',
    });
    expect(['xcrun', 'xcodebuild', ...args].join(' ')).toBe(
      `xcrun xcodebuild -workspace 'X.xcworkspace' -scheme 'A' -configuration 'Release' -destination 'generic/platform=iOS' analyze`,
    );
  });

  it('falls back to projectPath when workspacePath is missing', () => {
    const args = buildXcodebuildAnalyzeArgs({
      projectPath: 'X.xcodeproj',
      scheme: 'A',
    });
    expect(args.slice(0, 4)).toEqual(['-project', `'X.xcodeproj'`, '-scheme', `'A'`]);
    // No -workspace flag should leak in.
    expect(args).not.toContain('-workspace');
  });

  it('throws when scheme is missing', () => {
    expect(() =>
      buildXcodebuildAnalyzeArgs({ workspacePath: 'X.xcworkspace' }),
    ).toThrow(/scheme/);
  });

  it('throws when neither workspacePath nor projectPath is provided', () => {
    expect(() => buildXcodebuildAnalyzeArgs({ scheme: 'A' })).toThrow(
      /workspacePath.*projectPath/,
    );
  });

  it('appends additionalArgs split on whitespace and shell-quoted', () => {
    const args = buildXcodebuildAnalyzeArgs({
      workspacePath: 'X.xcworkspace',
      scheme: 'A',
      additionalArgs: 'CODE_SIGNING_ALLOWED=NO -quiet',
    });
    expect(args).toContain(`'CODE_SIGNING_ALLOWED=NO'`);
    expect(args).toContain(`'-quiet'`);
    // The action stays last.
    expect(args[args.length - 1]).toBe('analyze');
  });

  it('honours a destination override', () => {
    const args = buildXcodebuildAnalyzeArgs({
      workspacePath: 'X.xcworkspace',
      scheme: 'A',
      destination: 'platform=macOS',
    });
    const i = args.indexOf('-destination');
    expect(args[i + 1]).toBe(`'platform=macOS'`);
  });

  it('honours a configuration override (Debug)', () => {
    const args = buildXcodebuildAnalyzeArgs({
      workspacePath: 'X.xcworkspace',
      scheme: 'A',
      configuration: 'Debug',
    });
    const i = args.indexOf('-configuration');
    expect(args[i + 1]).toBe(`'Debug'`);
  });

  it('rejects an injected configuration value (defense-in-depth)', () => {
    expect(() =>
      buildXcodebuildAnalyzeArgs({
        workspacePath: 'X.xcworkspace',
        scheme: 'A',
        // @ts-expect-error testing the runtime guard with an off-union value
        configuration: 'Release; rm -rf /',
      }),
    ).toThrow(/invalid configuration/);
  });
});
