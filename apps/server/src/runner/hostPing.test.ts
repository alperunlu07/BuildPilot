import { describe, expect, it } from 'vitest';
import { parseCapabilities } from './hostPing';

describe('parseCapabilities', () => {
  it('extracts all three readings from the canonical Mac probe output', () => {
    const stdout = [
      '::xcode::',
      'Xcode 16.1',
      'Build version 16B40',
      '::macos::',
      '14.5',
      '::arch::',
      'arm64',
      '::end::',
    ].join('\n');
    const caps = parseCapabilities(stdout, 1000);
    expect(caps).toEqual({
      xcodeVersion: 'Xcode 16.1',
      macosVersion: '14.5',
      arch: 'arm64',
      lastCheckedAt: 1000,
    });
  });

  it('handles a Linux-shaped reply where xcodebuild is absent', () => {
    const stdout = [
      '::xcode::',
      '::macos::',
      '::arch::',
      'x86_64',
      '::end::',
    ].join('\n');
    const caps = parseCapabilities(stdout, 0);
    expect(caps.xcodeVersion).toBeUndefined();
    expect(caps.macosVersion).toBeUndefined();
    expect(caps.arch).toBe('x86_64');
  });

  it('rejects an xcodebuild line that does not look like an Xcode version', () => {
    const stdout = '::xcode::\nbash: xcodebuild: command not found\n::arch::\narm64\n::end::';
    const caps = parseCapabilities(stdout, 0);
    expect(caps.xcodeVersion).toBeUndefined();
    expect(caps.arch).toBe('arm64');
  });

  it('rejects a macos line that is not a version-shaped string', () => {
    const stdout = '::macos::\nsomething went wrong\n::arch::\narm64\n::end::';
    const caps = parseCapabilities(stdout, 0);
    expect(caps.macosVersion).toBeUndefined();
  });

  it('survives login banners and motd noise outside the markers', () => {
    const stdout = [
      'Last login: Wed Apr 30 12:34:56 2026 on ttys000',
      'Welcome to mac-builder',
      '::xcode::',
      'Xcode 15.4',
      '::macos::',
      '13.6',
      '::arch::',
      'arm64',
      'have a nice day',
    ].join('\n');
    const caps = parseCapabilities(stdout, 0);
    expect(caps.xcodeVersion).toBe('Xcode 15.4');
    expect(caps.macosVersion).toBe('13.6');
    // "have a nice day" lands inside the open arch section, but the arch
    // reading is the FIRST line — the canonical line for that section.
    expect(caps.arch).toBe('arm64');
  });

  it('tolerates CRLF line endings (ssh2 occasionally hands them through)', () => {
    const stdout = '::xcode::\r\nXcode 16.0\r\n::macos::\r\n14.0\r\n::arch::\r\narm64\r\n';
    const caps = parseCapabilities(stdout, 0);
    expect(caps.xcodeVersion).toBe('Xcode 16.0');
    expect(caps.macosVersion).toBe('14.0');
    expect(caps.arch).toBe('arm64');
  });

  it('returns an empty snapshot when the probe produced nothing', () => {
    const caps = parseCapabilities('', 7);
    expect(caps).toEqual({
      xcodeVersion: undefined,
      macosVersion: undefined,
      arch: undefined,
      lastCheckedAt: 7,
    });
  });
});
