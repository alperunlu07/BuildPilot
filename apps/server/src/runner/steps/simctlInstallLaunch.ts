import type { SimctlInstallLaunchStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { splitAdditionalArgs } from './_args';
import { execMaybeRemote, shellQuote } from './_exec';

// `xcrun simctl install / launch / terminate / uninstall` — the canonical
// "install the freshly-built app on the booted sim and start it" smoke test.
const VALID_ACTIONS = new Set(['install', 'launch', 'terminate', 'uninstall', 'installAndLaunch']);

export function buildSimctlInstallLaunchCommand(d: Partial<SimctlInstallLaunchStepData>): string[] {
  const action = d.action ?? 'installAndLaunch';
  if (!VALID_ACTIONS.has(action)) {
    throw new Error(`simctlInstallLaunch: invalid action "${action}"`);
  }
  const target = d.udid && d.udid.trim().length > 0 ? shellQuote(d.udid.trim()) : `'booted'`;

  if (action === 'install' || action === 'installAndLaunch') {
    if (!d.appPath || d.appPath.trim().length === 0) {
      throw new Error(`simctlInstallLaunch: ${action} needs "appPath"`);
    }
  }
  if (action === 'launch' || action === 'terminate' || action === 'uninstall' || action === 'installAndLaunch') {
    if (!d.bundleId || d.bundleId.trim().length === 0) {
      throw new Error(`simctlInstallLaunch: ${action} needs "bundleId"`);
    }
  }

  const cmds: string[] = [];
  if (action === 'install' || action === 'installAndLaunch') {
    cmds.push(`xcrun simctl install ${target} ${shellQuote(d.appPath!.trim())}`);
  }
  if (action === 'uninstall') {
    cmds.push(`xcrun simctl uninstall ${target} ${shellQuote(d.bundleId!.trim())}`);
  }
  if (action === 'launch' || action === 'installAndLaunch') {
    const launchParts = ['xcrun', 'simctl', 'launch'];
    if (d.waitForDebugger === 'true') launchParts.push('-w');
    if (d.console === 'true') launchParts.push('--console');
    launchParts.push(target, shellQuote(d.bundleId!.trim()));
    launchParts.push(...splitAdditionalArgs(d.launchArgs));
    cmds.push(launchParts.join(' '));
  }
  if (action === 'terminate') {
    cmds.push(`xcrun simctl terminate ${target} ${shellQuote(d.bundleId!.trim())}`);
  }
  return cmds;
}

export async function runSimctlInstallLaunch(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<SimctlInstallLaunchStepData>;
  const cmds = buildSimctlInstallLaunchCommand(d);
  for (const command of cmds) {
    await execMaybeRemote({ ctx, d, command, label: command });
  }
}
