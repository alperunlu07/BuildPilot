import { describe, expect, it } from 'vitest';
import { buildSnapshotCommand } from './snapshot';

describe('buildSnapshotCommand', () => {
  it('builds the canonical scheme + devices + languages invocation', () => {
    const cmd = buildSnapshotCommand({
      scheme: 'MyApp',
      devices: 'iPhone 16 Pro,iPad Pro',
      languages: 'en-US,fr-FR',
    });
    expect(cmd).toBe(
      `fastlane snapshot --output_directory 'screenshots' --scheme 'MyApp' --devices 'iPhone 16 Pro,iPad Pro' --languages 'en-US,fr-FR'`,
    );
  });

  it('defaults --output_directory to "screenshots" when blank', () => {
    expect(buildSnapshotCommand({})).toBe(`fastlane snapshot --output_directory 'screenshots'`);
  });

  it('honors a custom outputDirectory', () => {
    expect(
      buildSnapshotCommand({ outputDirectory: 'fastlane/screenshots' }),
    ).toBe(`fastlane snapshot --output_directory 'fastlane/screenshots'`);
  });

  it('passes workspacePath through as --workspace', () => {
    const cmd = buildSnapshotCommand({ workspacePath: 'X.xcworkspace' });
    expect(cmd).toContain(`--workspace 'X.xcworkspace'`);
  });

  it('passes projectPath through as --project', () => {
    const cmd = buildSnapshotCommand({ projectPath: 'X.xcodeproj' });
    expect(cmd).toContain(`--project 'X.xcodeproj'`);
  });

  it('emits multiple --launch_arguments flags from a multiline field', () => {
    const cmd = buildSnapshotCommand({
      launchArguments: '-StateA\n-StateB\n  \n-StateC',
    });
    expect(cmd).toContain(`--launch_arguments '-StateA'`);
    expect(cmd).toContain(`--launch_arguments '-StateB'`);
    expect(cmd).toContain(`--launch_arguments '-StateC'`);
    // blank lines must be dropped
    expect(cmd).not.toContain(`--launch_arguments ''`);
  });

  it('adds --clear_previous_screenshots when clearPreviousScreenshots="true"', () => {
    const cmd = buildSnapshotCommand({ clearPreviousScreenshots: 'true' });
    expect(cmd).toContain('--clear_previous_screenshots');
  });

  it('omits --clear_previous_screenshots by default', () => {
    const cmd = buildSnapshotCommand({});
    expect(cmd).not.toContain('--clear_previous_screenshots');
  });

  it('adds --output_simulator_logs when outputSimulatorLogs="true"', () => {
    const cmd = buildSnapshotCommand({ outputSimulatorLogs: 'true' });
    expect(cmd).toContain('--output_simulator_logs');
  });

  it('omits --output_simulator_logs by default', () => {
    const cmd = buildSnapshotCommand({});
    expect(cmd).not.toContain('--output_simulator_logs');
  });

  it('passes iosVersion through as --ios_version', () => {
    const cmd = buildSnapshotCommand({ iosVersion: '17.5' });
    expect(cmd).toContain(`--ios_version '17.5'`);
  });

  it('appends additionalArgs split on whitespace, each shell-quoted', () => {
    const cmd = buildSnapshotCommand({
      additionalArgs: '--verbose --skip_open_summary',
    });
    expect(cmd).toContain(`'--verbose'`);
    expect(cmd).toContain(`'--skip_open_summary'`);
  });

  it('shell-quotes device names containing spaces as a single token', () => {
    const cmd = buildSnapshotCommand({ devices: 'iPhone 16 Pro Max' });
    expect(cmd).toContain(`--devices 'iPhone 16 Pro Max'`);
  });

  it('combines all flags in a stable order', () => {
    const cmd = buildSnapshotCommand({
      outputDirectory: 'shots',
      outputSimulatorLogs: 'true',
      iosVersion: '17.5',
      scheme: 'MyApp',
      workspacePath: 'X.xcworkspace',
      devices: 'iPhone 16 Pro',
      languages: 'en-US',
      launchArguments: '-StateA',
      clearPreviousScreenshots: 'true',
    });
    expect(cmd).toBe(
      `fastlane snapshot --output_directory 'shots' --output_simulator_logs --ios_version '17.5' --scheme 'MyApp' --workspace 'X.xcworkspace' --devices 'iPhone 16 Pro' --languages 'en-US' --launch_arguments '-StateA' --clear_previous_screenshots`,
    );
  });
});
