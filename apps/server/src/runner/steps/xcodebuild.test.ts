import { describe, expect, it } from 'vitest';
import { buildXcodebuildArgs, prettifierSuffix } from './xcodebuild';

describe('buildXcodebuildArgs - archive action', () => {
  it('builds an archive invocation from a workspace', () => {
    const args = buildXcodebuildArgs({
      workspacePath: 'MyGame.xcworkspace',
      scheme: 'MyGame',
      configuration: 'Release',
      destination: 'generic/platform=iOS',
      archivePath: 'build/MyGame.xcarchive',
      buildAction: 'archive',
    });
    expect(args).toEqual([
      '-workspace',
      'MyGame.xcworkspace',
      '-scheme',
      'MyGame',
      '-configuration',
      'Release',
      '-destination',
      'generic/platform=iOS',
      'archive',
      '-archivePath',
      'build/MyGame.xcarchive',
    ]);
  });

  it('falls back to projectPath when workspacePath is missing', () => {
    const args = buildXcodebuildArgs({
      projectPath: 'MyGame.xcodeproj',
      scheme: 'MyGame',
      buildAction: 'archive',
    });
    expect(args.slice(0, 4)).toEqual(['-project', 'MyGame.xcodeproj', '-scheme', 'MyGame']);
  });

  it('throws when scheme is missing on archive', () => {
    expect(() =>
      buildXcodebuildArgs({ workspacePath: 'X.xcworkspace', buildAction: 'archive' }),
    ).toThrow(/missing "scheme"/);
  });

  it('throws when neither workspace nor project is provided', () => {
    expect(() => buildXcodebuildArgs({ scheme: 'MyGame', buildAction: 'archive' })).toThrow(
      /workspacePath.*projectPath/,
    );
  });
});

describe('buildXcodebuildArgs - exportArchive action', () => {
  it('builds an exportArchive invocation with no scheme/workspace required', () => {
    const args = buildXcodebuildArgs({
      buildAction: 'exportArchive',
      archivePath: 'build/MyGame.xcarchive',
      exportPath: 'build/export',
      exportOptionsPlist: 'signing/ExportOptions.plist',
    });
    expect(args).toEqual([
      '-exportArchive',
      '-archivePath',
      'build/MyGame.xcarchive',
      '-exportPath',
      'build/export',
      '-exportOptionsPlist',
      'signing/ExportOptions.plist',
    ]);
  });

  it('does not require scheme on exportArchive even if workspacePath is set', () => {
    // exportArchive ignores -workspace/-scheme so we shouldn't error if they
    // happen to be missing. Also asserts those flags don't sneak into argv.
    const args = buildXcodebuildArgs({
      buildAction: 'exportArchive',
      workspacePath: 'MyGame.xcworkspace',
      scheme: 'MyGame',
      archivePath: 'a.xcarchive',
      exportPath: 'export',
      exportOptionsPlist: 'opts.plist',
    });
    expect(args).not.toContain('-workspace');
    expect(args).not.toContain('-scheme');
  });

  it('throws when archivePath is missing', () => {
    expect(() =>
      buildXcodebuildArgs({
        buildAction: 'exportArchive',
        exportPath: 'e',
        exportOptionsPlist: 'p',
      }),
    ).toThrow(/archivePath/);
  });

  it('throws when exportPath is missing', () => {
    expect(() =>
      buildXcodebuildArgs({
        buildAction: 'exportArchive',
        archivePath: 'a',
        exportOptionsPlist: 'p',
      }),
    ).toThrow(/exportPath/);
  });

  it('throws when exportOptionsPlist is missing', () => {
    expect(() =>
      buildXcodebuildArgs({
        buildAction: 'exportArchive',
        archivePath: 'a',
        exportPath: 'e',
      }),
    ).toThrow(/exportOptionsPlist/);
  });
});

describe('buildXcodebuildArgs - additional args + non-archive actions', () => {
  it('appends additionalArgs split on whitespace', () => {
    const args = buildXcodebuildArgs({
      workspacePath: 'a.xcworkspace',
      scheme: 'A',
      buildAction: 'build',
      additionalArgs: 'CODE_SIGNING_ALLOWED=NO -quiet',
    });
    expect(args).toContain('CODE_SIGNING_ALLOWED=NO');
    expect(args).toContain('-quiet');
  });

  it('uses "build" as default action when none is provided', () => {
    const args = buildXcodebuildArgs({
      workspacePath: 'a.xcworkspace',
      scheme: 'A',
    });
    expect(args).toContain('build');
  });

  it('passes test / clean actions through verbatim', () => {
    expect(
      buildXcodebuildArgs({ workspacePath: 'x', scheme: 'A', buildAction: 'test' }),
    ).toContain('test');
    expect(
      buildXcodebuildArgs({ workspacePath: 'x', scheme: 'A', buildAction: 'clean' }),
    ).toContain('clean');
  });
});

describe('buildXcodebuildArgs - testRetryMode', () => {
  it('emits -retry-tests-on-failure with -test-iterations N', () => {
    const args = buildXcodebuildArgs({
      workspacePath: 'x',
      scheme: 'A',
      buildAction: 'test',
      testRetryMode: 'retry-on-failure',
      testIterations: 5,
    });
    expect(args).toContain('-test-iterations');
    expect(args).toContain('5');
    expect(args).toContain('-retry-tests-on-failure');
  });

  it('emits -run-tests-until-failure for until-failure mode', () => {
    const args = buildXcodebuildArgs({
      workspacePath: 'x',
      scheme: 'A',
      buildAction: 'test',
      testRetryMode: 'until-failure',
    });
    expect(args).toContain('-run-tests-until-failure');
  });

  it('emits bare -test-iterations for repeat mode (no companion flag)', () => {
    const args = buildXcodebuildArgs({
      workspacePath: 'x',
      scheme: 'A',
      buildAction: 'test',
      testRetryMode: 'repeat',
      testIterations: 10,
    });
    expect(args).toContain('-test-iterations');
    expect(args).toContain('10');
    expect(args).not.toContain('-retry-tests-on-failure');
    expect(args).not.toContain('-run-tests-until-failure');
  });

  it('ignores testRetryMode when buildAction is not test', () => {
    const args = buildXcodebuildArgs({
      workspacePath: 'x',
      scheme: 'A',
      buildAction: 'archive',
      testRetryMode: 'retry-on-failure',
    });
    expect(args).not.toContain('-test-iterations');
    expect(args).not.toContain('-retry-tests-on-failure');
  });

  it('caps iterations to the Xcode-imposed max of 50', () => {
    const args = buildXcodebuildArgs({
      workspacePath: 'x',
      scheme: 'A',
      buildAction: 'test',
      testRetryMode: 'repeat',
      testIterations: 9999,
    });
    expect(args).toContain('50');
  });

  it('floors iterations at 2 (retry semantics need >1 iteration)', () => {
    const args = buildXcodebuildArgs({
      workspacePath: 'x',
      scheme: 'A',
      buildAction: 'test',
      testRetryMode: 'retry-on-failure',
      testIterations: 1,
    });
    expect(args).toContain('2');
  });

  it('omits all iteration flags when testRetryMode is none / unset', () => {
    const args = buildXcodebuildArgs({
      workspacePath: 'x',
      scheme: 'A',
      buildAction: 'test',
    });
    expect(args).not.toContain('-test-iterations');
  });
});

describe('prettifierSuffix', () => {
  it('returns "" for none / undefined', () => {
    expect(prettifierSuffix('none')).toBe('');
    expect(prettifierSuffix(undefined)).toBe('');
  });

  it('returns " | xcpretty" / " | xcbeautify" for the two formatters', () => {
    expect(prettifierSuffix('xcpretty')).toBe(' | xcpretty');
    expect(prettifierSuffix('xcbeautify')).toBe(' | xcbeautify');
  });
});
