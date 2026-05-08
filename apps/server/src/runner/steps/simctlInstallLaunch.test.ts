import { describe, expect, it } from 'vitest';
import { buildSimctlInstallLaunchCommand } from './simctlInstallLaunch';

describe('buildSimctlInstallLaunchCommand', () => {
  it('default action installAndLaunch chains install + launch', () => {
    const cmds = buildSimctlInstallLaunchCommand({
      appPath: 'build/MyApp.app',
      bundleId: 'com.example.app',
    });
    expect(cmds).toEqual([
      `xcrun simctl install 'booted' 'build/MyApp.app'`,
      `xcrun simctl launch 'booted' 'com.example.app'`,
    ]);
  });

  it('passes waitForDebugger + console + launch args through to launch', () => {
    const cmds = buildSimctlInstallLaunchCommand({
      action: 'launch',
      bundleId: 'com.example.app',
      udid: 'ABCDEF',
      waitForDebugger: 'true',
      console: 'true',
      launchArgs: '-myFlag value',
    });
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toBe(`xcrun simctl launch -w --console 'ABCDEF' 'com.example.app' '-myFlag' 'value'`);
  });

  it('terminate command shape', () => {
    const cmds = buildSimctlInstallLaunchCommand({
      action: 'terminate',
      bundleId: 'com.example.app',
    });
    expect(cmds).toEqual([`xcrun simctl terminate 'booted' 'com.example.app'`]);
  });

  it('uninstall command shape', () => {
    const cmds = buildSimctlInstallLaunchCommand({
      action: 'uninstall',
      bundleId: 'com.example.app',
    });
    expect(cmds).toEqual([`xcrun simctl uninstall 'booted' 'com.example.app'`]);
  });

  it('install needs appPath, launch/terminate/uninstall need bundleId', () => {
    expect(() => buildSimctlInstallLaunchCommand({ action: 'install' })).toThrow(/appPath/);
    expect(() => buildSimctlInstallLaunchCommand({ action: 'launch' })).toThrow(/bundleId/);
    expect(() => buildSimctlInstallLaunchCommand({ action: 'installAndLaunch', appPath: 'a' })).toThrow(/bundleId/);
  });
});
