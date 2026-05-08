import { describe, expect, it } from 'vitest';
import { buildSimctlScreenshotCommand } from './simctlScreenshot';
import { buildSimctlStatusBarCommand } from './simctlStatusBarOverride';
import { buildSimctlPrivacyCommand } from './simctlPrivacyGrant';

describe('buildSimctlScreenshotCommand', () => {
  it('builds a default screenshot command', () => {
    const cmd = buildSimctlScreenshotCommand({ outputPath: 'screenshots/home.png' });
    expect(cmd).toBe(`xcrun simctl io 'booted' screenshot 'screenshots/home.png'`);
  });

  it('passes optional flags', () => {
    const cmd = buildSimctlScreenshotCommand({
      udid: '00008101-001A2B',
      outputPath: 'home.png',
      type: 'png',
      display: 'internal',
      mask: 'ignored',
    });
    expect(cmd).toContain(`'00008101-001A2B'`);
    expect(cmd).toContain(`--type 'png'`);
    expect(cmd).toContain(`--display 'internal'`);
    expect(cmd).toContain(`--mask 'ignored'`);
  });

  it('recordVideo with codec and force', () => {
    const cmd = buildSimctlScreenshotCommand({
      mode: 'recordVideo',
      outputPath: 'demo.mp4',
      codec: 'h264',
      force: 'true',
    });
    expect(cmd).toContain('recordVideo');
    expect(cmd).toContain(`--codec 'h264'`);
    expect(cmd).toContain('--force');
  });

  it('throws on invalid mode + missing outputPath', () => {
    expect(() => buildSimctlScreenshotCommand({ mode: 'wat' as never })).toThrow(/mode/);
    expect(() => buildSimctlScreenshotCommand({})).toThrow(/outputPath/);
  });
});

describe('buildSimctlStatusBarCommand', () => {
  it('default override pins time to 9:41 + battery to 100%', () => {
    const cmd = buildSimctlStatusBarCommand({});
    expect(cmd).toBe(
      `xcrun simctl status_bar 'booted' override --time '9:41' --batteryLevel '100'`,
    );
  });

  it('passes through full marketing-screenshot config', () => {
    const cmd = buildSimctlStatusBarCommand({
      udid: 'X',
      time: '12:34',
      dataNetwork: 'wifi',
      wifiMode: 'active',
      wifiBars: 3,
      cellularMode: 'active',
      cellularBars: 4,
      operatorName: 'BuildPilot',
      batteryState: 'charged',
      batteryLevel: 85,
    });
    expect(cmd).toContain(`--time '12:34'`);
    expect(cmd).toContain(`--wifiBars '3'`);
    expect(cmd).toContain(`--cellularMode 'active'`);
    expect(cmd).toContain(`--operatorName 'BuildPilot'`);
    expect(cmd).toContain(`--batteryLevel '85'`);
  });

  it('clear / list short-circuit', () => {
    expect(buildSimctlStatusBarCommand({ action: 'clear' })).toBe(`xcrun simctl status_bar 'booted' clear`);
    expect(buildSimctlStatusBarCommand({ action: 'list' })).toBe(`xcrun simctl status_bar 'booted' list`);
  });
});

describe('buildSimctlPrivacyCommand', () => {
  it('grants a service to all apps when bundleId is omitted', () => {
    const cmd = buildSimctlPrivacyCommand({ service: 'photos' });
    expect(cmd).toBe(`xcrun simctl privacy 'booted' grant 'photos'`);
  });

  it('targets a specific bundleId', () => {
    const cmd = buildSimctlPrivacyCommand({
      action: 'grant',
      service: 'camera',
      bundleId: 'com.example.app',
      udid: 'X',
    });
    expect(cmd).toBe(`xcrun simctl privacy 'X' grant 'camera' 'com.example.app'`);
  });

  it('rejects invalid action and missing service', () => {
    expect(() => buildSimctlPrivacyCommand({ action: 'wat' as never })).toThrow(/action/);
    expect(() => buildSimctlPrivacyCommand({})).toThrow(/service/);
  });
});
