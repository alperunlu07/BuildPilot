import { describe, expect, it } from 'vitest';
import { buildPeripheryScanCommand } from './peripheryScan';

describe('buildPeripheryScanCommand', () => {
  it('produces a canonical workspace + schemes invocation', () => {
    expect(
      buildPeripheryScanCommand({
        workspacePath: 'X.xcworkspace',
        schemes: 'Free,Pro',
      }),
    ).toBe(`periphery scan --workspace 'X.xcworkspace' --schemes 'Free,Pro' --format xcode`);
  });

  it('falls back to --project when workspacePath is missing', () => {
    const cmd = buildPeripheryScanCommand({
      projectPath: 'X.xcodeproj',
      schemes: 'A',
    });
    expect(cmd).toContain(`--project 'X.xcodeproj'`);
    expect(cmd).not.toContain('--workspace');
  });

  it('emits --format json when format=json', () => {
    const cmd = buildPeripheryScanCommand({
      workspacePath: 'X.xcworkspace',
      format: 'json',
    });
    expect(cmd).toContain('--format json');
  });

  it('adds --strict when strict="true"', () => {
    const cmd = buildPeripheryScanCommand({
      workspacePath: 'X.xcworkspace',
      strict: 'true',
    });
    expect(cmd).toContain('--strict');
  });

  it('omits --strict when strict is the default "false"', () => {
    const cmd = buildPeripheryScanCommand({
      workspacePath: 'X.xcworkspace',
      strict: 'false',
    });
    expect(cmd).not.toContain('--strict');
  });

  it('passes targets through as a single shell-quoted token', () => {
    const cmd = buildPeripheryScanCommand({
      workspacePath: 'X.xcworkspace',
      targets: 'AppKit,UIKit',
    });
    expect(cmd).toContain(`--targets 'AppKit,UIKit'`);
  });

  it('throws when neither workspacePath nor projectPath is provided', () => {
    expect(() => buildPeripheryScanCommand({ schemes: 'A' })).toThrow(
      /workspacePath.*projectPath/,
    );
  });

  it('throws on an invalid format', () => {
    expect(() =>
      buildPeripheryScanCommand({
        workspacePath: 'X.xcworkspace',
        // @ts-expect-error testing the runtime guard
        format: 'bogus',
      }),
    ).toThrow(/invalid format/);
  });

  it('emits --config <file> when configFile is set', () => {
    const cmd = buildPeripheryScanCommand({
      workspacePath: 'X.xcworkspace',
      configFile: '.periphery.yml',
    });
    expect(cmd).toContain(`--config '.periphery.yml'`);
  });
});
