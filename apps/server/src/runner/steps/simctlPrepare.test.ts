import { describe, expect, it } from 'vitest';
import { buildSimctlPrepareCommand } from './simctlPrepare';

describe('buildSimctlPrepareCommand', () => {
  it('defaults to booting "booted" (the active sim)', () => {
    expect(buildSimctlPrepareCommand({})).toBe(`xcrun simctl boot 'booted'`);
  });

  it('boots a specific UDID', () => {
    const cmd = buildSimctlPrepareCommand({ action: 'boot', udid: '00008101-001A2B' });
    expect(cmd).toBe(`xcrun simctl boot '00008101-001A2B'`);
  });

  it('shutdownAll uses the literal sentinel', () => {
    expect(buildSimctlPrepareCommand({ action: 'shutdownAll' })).toBe('xcrun simctl shutdown all');
  });

  it('eraseAll uses the literal sentinel', () => {
    expect(buildSimctlPrepareCommand({ action: 'eraseAll' })).toBe('xcrun simctl erase all');
  });

  it('create needs name + type + optional runtime', () => {
    expect(() => buildSimctlPrepareCommand({ action: 'create' })).toThrow(/deviceName/);
    expect(() => buildSimctlPrepareCommand({ action: 'create', deviceName: 'X' })).toThrow(/deviceType/);
    const cmd = buildSimctlPrepareCommand({
      action: 'create',
      deviceName: 'CI iPhone 16',
      deviceType: 'com.apple.CoreSimulator.SimDeviceType.iPhone-16',
      runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-18-0',
    });
    expect(cmd).toBe(
      `xcrun simctl create 'CI iPhone 16' 'com.apple.CoreSimulator.SimDeviceType.iPhone-16' 'com.apple.CoreSimulator.SimRuntime.iOS-18-0'`,
    );
  });

  it('rejects unknown actions', () => {
    expect(() => buildSimctlPrepareCommand({ action: 'launch' as never })).toThrow(/action/);
  });
});
