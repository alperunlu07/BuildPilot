import { describe, expect, it } from 'vitest';
import { buildAppGymCommand } from './buildAppGym';

describe('buildAppGymCommand', () => {
  it('throws when neither workspacePath nor projectPath is set', () => {
    expect(() => buildAppGymCommand({ scheme: 'X' })).toThrow(/workspacePath.*projectPath/);
  });

  it('throws on missing scheme', () => {
    expect(() => buildAppGymCommand({ workspacePath: 'X.xcworkspace' })).toThrow(/scheme/);
  });

  it('builds the canonical archive+export flow', () => {
    const cmd = buildAppGymCommand({
      workspacePath: 'MyApp.xcworkspace',
      scheme: 'MyApp',
      configuration: 'Release',
      exportMethod: 'app-store',
      exportOptionsPlist: 'signing/ExportOptions.plist',
      outputDirectory: 'build/ipa',
      outputName: 'MyApp-1.4.0',
      cleanBeforeBuild: 'true',
    });
    expect(cmd).toBe(
      `fastlane gym --workspace 'MyApp.xcworkspace' --scheme 'MyApp' --configuration 'Release' ` +
        `--export_method 'app-store' --export_options 'signing/ExportOptions.plist' ` +
        `--output_directory 'build/ipa' --output_name 'MyApp-1.4.0' --clean true`,
    );
  });

  it('uses --project when no workspace given', () => {
    const cmd = buildAppGymCommand({ projectPath: 'MyApp.xcodeproj', scheme: 'MyApp' });
    expect(cmd).toContain(`--project 'MyApp.xcodeproj'`);
    expect(cmd).not.toContain('--workspace');
  });

  it('honours skip flags', () => {
    const cmd = buildAppGymCommand({
      workspacePath: 'X.xcworkspace',
      scheme: 'X',
      skipArchive: 'true',
      skipPackageIpa: 'true',
    });
    expect(cmd).toContain('--skip_archive true');
    expect(cmd).toContain('--skip_package_ipa true');
  });

  it('append additionalArgs verbatim', () => {
    const cmd = buildAppGymCommand({
      workspacePath: 'X.xcworkspace',
      scheme: 'X',
      additionalArgs: '--xcargs OTHER_SWIFT_FLAGS=-D=DEBUG',
    });
    expect(cmd).toMatch(/'--xcargs'\s+'OTHER_SWIFT_FLAGS=-D=DEBUG'/);
  });
});
