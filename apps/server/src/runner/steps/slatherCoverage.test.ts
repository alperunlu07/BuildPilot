import { describe, expect, it } from 'vitest';
import { buildSlatherCoverageCommand } from './slatherCoverage';

describe('buildSlatherCoverageCommand', () => {
  it('produces the canonical html invocation with scheme', () => {
    expect(
      buildSlatherCoverageCommand({
        projectPath: 'MyApp.xcodeproj',
        scheme: 'MyApp',
        outputDirectory: 'coverage_html',
      }),
    ).toBe(
      `slather coverage --html --output-directory 'coverage_html' --scheme 'MyApp' 'MyApp.xcodeproj'`,
    );
  });

  it('uses --cobertura-xml when format=cobertura', () => {
    const cmd = buildSlatherCoverageCommand({
      projectPath: 'MyApp.xcodeproj',
      format: 'cobertura',
    });
    expect(cmd).toContain('--cobertura-xml');
    expect(cmd).not.toContain('--html');
  });

  it('uses --json when format=json', () => {
    const cmd = buildSlatherCoverageCommand({
      projectPath: 'MyApp.xcodeproj',
      format: 'json',
    });
    expect(cmd).toContain('--json');
    expect(cmd).not.toContain('--html');
  });

  it('uses --sonarqube-xml when format=sonarqube', () => {
    const cmd = buildSlatherCoverageCommand({
      projectPath: 'MyApp.xcodeproj',
      format: 'sonarqube',
    });
    expect(cmd).toContain('--sonarqube-xml');
  });

  it('uses --simple-output when format=simple', () => {
    const cmd = buildSlatherCoverageCommand({
      projectPath: 'MyApp.xcodeproj',
      format: 'simple',
    });
    expect(cmd).toContain('--simple-output');
  });

  it('adds --workspace when workspacePath is set', () => {
    const cmd = buildSlatherCoverageCommand({
      projectPath: 'MyApp.xcodeproj',
      workspacePath: 'MyApp.xcworkspace',
    });
    expect(cmd).toContain(`--workspace 'MyApp.xcworkspace'`);
  });

  it('adds --build-directory when buildDirectory is set', () => {
    const cmd = buildSlatherCoverageCommand({
      projectPath: 'MyApp.xcodeproj',
      buildDirectory: 'build/DerivedData',
    });
    expect(cmd).toContain(`--build-directory 'build/DerivedData'`);
  });

  it('places the project path as the trailing positional arg', () => {
    const cmd = buildSlatherCoverageCommand({
      projectPath: 'MyApp.xcodeproj',
      scheme: 'MyApp',
    });
    expect(cmd.endsWith(`'MyApp.xcodeproj'`)).toBe(true);
  });

  it('throws when projectPath is missing', () => {
    expect(() => buildSlatherCoverageCommand({})).toThrow(/projectPath/);
  });

  it('throws on an invalid format', () => {
    expect(() =>
      buildSlatherCoverageCommand({
        projectPath: 'MyApp.xcodeproj',
        // @ts-expect-error testing the runtime guard
        format: 'bogus',
      }),
    ).toThrow(/invalid format/);
  });

  it('splits and shell-quotes additionalArgs', () => {
    const cmd = buildSlatherCoverageCommand({
      projectPath: 'MyApp.xcodeproj',
      additionalArgs: '--ignore Pods/* --verbose',
    });
    expect(cmd).toContain(`'--ignore' 'Pods/*' '--verbose'`);
  });
});
