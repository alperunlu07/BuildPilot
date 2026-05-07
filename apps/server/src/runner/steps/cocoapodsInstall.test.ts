import { describe, expect, it } from 'vitest';
import { buildCocoapodsCommand } from './cocoapodsInstall';
import { buildSwiftPackageResolveArgs } from './swiftPackageResolve';

describe('buildCocoapodsCommand', () => {
  it('defaults to plain `pod install`', () => {
    expect(buildCocoapodsCommand({})).toBe('pod install');
  });

  it('switches to `pod update` when command="update"', () => {
    expect(buildCocoapodsCommand({ command: 'update' })).toBe('pod update');
  });

  it('prefixes `bundle exec` when useBundleExec="true"', () => {
    expect(buildCocoapodsCommand({ useBundleExec: 'true' })).toBe('bundle exec pod install');
  });

  it('appends --repo-update when repoUpdate="true"', () => {
    expect(buildCocoapodsCommand({ repoUpdate: 'true' })).toBe('pod install --repo-update');
  });

  it('throws on an invalid command', () => {
    // @ts-expect-error testing the runtime guard
    expect(() => buildCocoapodsCommand({ command: 'bogus' })).toThrow(/invalid command/);
  });

  it('appends additionalArgs split + shell-quoted', () => {
    const cmd = buildCocoapodsCommand({ additionalArgs: '--verbose --no-integrate' });
    expect(cmd).toContain(`'--verbose'`);
    expect(cmd).toContain(`'--no-integrate'`);
  });
});

describe('buildSwiftPackageResolveArgs', () => {
  it('builds the canonical workspace invocation', () => {
    const args = buildSwiftPackageResolveArgs({
      workspacePath: 'MyGame.xcworkspace',
    });
    expect(args).toEqual([
      'xcrun',
      'xcodebuild',
      '-resolvePackageDependencies',
      '-workspace',
      `'MyGame.xcworkspace'`,
    ]);
  });

  it('falls back to -project when workspacePath is missing', () => {
    const args = buildSwiftPackageResolveArgs({ projectPath: 'MyGame.xcodeproj' });
    expect(args).toContain('-project');
    expect(args).toContain(`'MyGame.xcodeproj'`);
  });

  it('appends -scheme when provided', () => {
    const args = buildSwiftPackageResolveArgs({
      workspacePath: 'a.xcworkspace',
      scheme: 'MyGame',
    });
    expect(args).toContain('-scheme');
    expect(args).toContain(`'MyGame'`);
  });

  it('appends -clonedSourcePackagesDirPath when provided', () => {
    const args = buildSwiftPackageResolveArgs({
      workspacePath: 'a.xcworkspace',
      clonedSourcePackagesDirPath: 'build/SourcePackages',
    });
    expect(args).toContain('-clonedSourcePackagesDirPath');
    expect(args).toContain(`'build/SourcePackages'`);
  });

  it('throws when neither workspacePath nor projectPath is provided', () => {
    expect(() => buildSwiftPackageResolveArgs({})).toThrow(/workspacePath.*projectPath/);
  });
});
