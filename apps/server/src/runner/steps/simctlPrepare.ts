import type { SimctlPrepareStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { splitAdditionalArgs } from './_args';
import { execMaybeRemote, shellQuote } from './_exec';

// `xcrun simctl` simulator lifecycle: boot / shutdown / erase / create.
// Wrapper-only — relies on simctl being available on the Mac (Xcode-shipped
// command line tools).
const VALID_ACTIONS = new Set(['boot', 'shutdown', 'erase', 'create', 'shutdownAll', 'eraseAll']);

export function buildSimctlPrepareCommand(d: Partial<SimctlPrepareStepData>): string {
  const action = d.action ?? 'boot';
  if (!VALID_ACTIONS.has(action)) {
    throw new Error(`simctlPrepare: invalid action "${action}"`);
  }

  if (action === 'shutdownAll') return 'xcrun simctl shutdown all';
  if (action === 'eraseAll') return 'xcrun simctl erase all';

  if (action === 'create') {
    if (!d.deviceName || d.deviceName.trim().length === 0) {
      throw new Error('simctlPrepare: create needs "deviceName"');
    }
    if (!d.deviceType || d.deviceType.trim().length === 0) {
      throw new Error('simctlPrepare: create needs "deviceType"');
    }
    const parts = ['xcrun', 'simctl', 'create', shellQuote(d.deviceName.trim()), shellQuote(d.deviceType.trim())];
    if (d.runtime && d.runtime.trim().length > 0) parts.push(shellQuote(d.runtime.trim()));
    parts.push(...splitAdditionalArgs(d.additionalArgs));
    return parts.join(' ');
  }

  // boot / shutdown / erase need a UDID or "booted".
  const target = d.udid && d.udid.trim().length > 0 ? d.udid.trim() : 'booted';
  const parts = ['xcrun', 'simctl', action, shellQuote(target)];
  parts.push(...splitAdditionalArgs(d.additionalArgs));
  return parts.join(' ');
}

export async function runSimctlPrepare(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<SimctlPrepareStepData>;
  const command = buildSimctlPrepareCommand(d);
  await execMaybeRemote({
    ctx,
    d,
    command,
    cwd: d.cwd && d.cwd.trim().length > 0 ? d.cwd : undefined,
    label: `simctl ${d.action ?? 'boot'}${d.udid ? ` ${d.udid}` : ''}${d.deviceName ? ` "${d.deviceName}"` : ''}`,
  });
}
