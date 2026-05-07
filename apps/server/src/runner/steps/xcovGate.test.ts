import { describe, expect, it } from 'vitest';
import { buildXcovGateCommand } from './xcovGate';

describe('buildXcovGateCommand', () => {
  it('produces a canonical workspace + scheme invocation', () => {
    expect(
      buildXcovGateCommand({
        workspacePath: 'X.xcworkspace',
        scheme: 'A',
      }),
    ).toBe(`xcov --workspace 'X.xcworkspace' --scheme 'A' --output_directory 'xcov_report'`);
  });

  it('falls back to --project when workspacePath is missing', () => {
    const cmd = buildXcovGateCommand({
      projectPath: 'X.xcodeproj',
      scheme: 'A',
    });
    expect(cmd).toContain(`--project 'X.xcodeproj'`);
    expect(cmd).not.toContain('--workspace');
  });

  it('throws when scheme is missing', () => {
    expect(() =>
      buildXcovGateCommand({ workspacePath: 'X.xcworkspace' }),
    ).toThrow(/scheme/);
  });

  it('throws when neither workspacePath nor projectPath is provided', () => {
    expect(() => buildXcovGateCommand({ scheme: 'A' })).toThrow(
      /workspacePath.*projectPath/,
    );
  });

  it('emits --minimum_coverage_percentage when set above zero', () => {
    const cmd = buildXcovGateCommand({
      workspacePath: 'X.xcworkspace',
      scheme: 'A',
      minimumCoveragePercentage: 80,
    });
    expect(cmd).toContain('--minimum_coverage_percentage 80');
  });

  it('omits --minimum_coverage_percentage when it is the default 0', () => {
    const cmd = buildXcovGateCommand({
      workspacePath: 'X.xcworkspace',
      scheme: 'A',
      minimumCoveragePercentage: 0,
    });
    expect(cmd).not.toContain('--minimum_coverage_percentage');
  });

  it('passes includeTargets and excludeTargets through as quoted lists', () => {
    const cmd = buildXcovGateCommand({
      workspacePath: 'X.xcworkspace',
      scheme: 'A',
      includeTargets: 'Foo,Bar',
      excludeTargets: 'Tests,UITests',
    });
    expect(cmd).toContain(`--include_targets 'Foo,Bar'`);
    expect(cmd).toContain(`--exclude_targets 'Tests,UITests'`);
  });

  it('adds --json_report when jsonReport="true"', () => {
    const cmd = buildXcovGateCommand({
      workspacePath: 'X.xcworkspace',
      scheme: 'A',
      jsonReport: 'true',
    });
    expect(cmd).toContain('--json_report');
  });

  it('adds --markdown_report when markdownReport="true"', () => {
    const cmd = buildXcovGateCommand({
      workspacePath: 'X.xcworkspace',
      scheme: 'A',
      markdownReport: 'true',
    });
    expect(cmd).toContain('--markdown_report');
  });

  it('honours a custom outputDirectory', () => {
    const cmd = buildXcovGateCommand({
      workspacePath: 'X.xcworkspace',
      scheme: 'A',
      outputDirectory: 'custom_dir',
    });
    expect(cmd).toContain(`--output_directory 'custom_dir'`);
    expect(cmd).not.toContain(`'xcov_report'`);
  });

  it('combines all flags in a stable order matching the spec sample', () => {
    expect(
      buildXcovGateCommand({
        workspacePath: 'MyApp.xcworkspace',
        scheme: 'MyApp',
        minimumCoveragePercentage: 80,
      }),
    ).toBe(
      `xcov --workspace 'MyApp.xcworkspace' --scheme 'MyApp' --minimum_coverage_percentage 80 --output_directory 'xcov_report'`,
    );
  });

  it('splits and shell-quotes additionalArgs', () => {
    const cmd = buildXcovGateCommand({
      workspacePath: 'X.xcworkspace',
      scheme: 'A',
      additionalArgs: '--legacy_support --verbose',
    });
    expect(cmd).toContain(`'--legacy_support' '--verbose'`);
  });
});
