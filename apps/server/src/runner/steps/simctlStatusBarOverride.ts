import type { SimctlStatusBarOverrideStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { execMaybeRemote, shellQuote } from './_exec';

// `xcrun simctl status_bar <udid> override` — pretty up the status bar
// before grabbing App Store screenshots. Apple's Marketing Guidelines
// require 9:41 time + full battery + full signal for submission images.
export function buildSimctlStatusBarCommand(d: Partial<SimctlStatusBarOverrideStepData>): string {
  const target = d.udid && d.udid.trim().length > 0 ? shellQuote(d.udid.trim()) : `'booted'`;
  const action = d.action ?? 'override';
  if (action !== 'override' && action !== 'clear' && action !== 'list') {
    throw new Error(`simctlStatusBarOverride: invalid action "${action}"`);
  }

  if (action === 'list' || action === 'clear') {
    return `xcrun simctl status_bar ${target} ${action}`;
  }

  const parts = ['xcrun', 'simctl', 'status_bar', target, 'override'];
  // Apple Marketing defaults — applied when the field is blank.
  const time = d.time ?? '9:41';
  parts.push('--time', shellQuote(time));
  if (d.dataNetwork && d.dataNetwork.trim().length > 0) {
    parts.push('--dataNetwork', shellQuote(d.dataNetwork.trim()));
  }
  if (d.wifiMode && d.wifiMode.trim().length > 0) {
    parts.push('--wifiMode', shellQuote(d.wifiMode.trim()));
  }
  if (d.wifiBars && String(d.wifiBars).length > 0) {
    parts.push('--wifiBars', shellQuote(String(d.wifiBars)));
  }
  if (d.cellularMode && d.cellularMode.trim().length > 0) {
    parts.push('--cellularMode', shellQuote(d.cellularMode.trim()));
  }
  if (d.cellularBars && String(d.cellularBars).length > 0) {
    parts.push('--cellularBars', shellQuote(String(d.cellularBars)));
  }
  if (d.operatorName && d.operatorName.trim().length > 0) {
    parts.push('--operatorName', shellQuote(d.operatorName.trim()));
  }
  if (d.batteryState && d.batteryState.trim().length > 0) {
    parts.push('--batteryState', shellQuote(d.batteryState.trim()));
  }
  const batteryLevel = d.batteryLevel ?? 100;
  parts.push('--batteryLevel', shellQuote(String(batteryLevel)));
  return parts.join(' ');
}

export async function runSimctlStatusBarOverride(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<SimctlStatusBarOverrideStepData>;
  const command = buildSimctlStatusBarCommand(d);
  await execMaybeRemote({
    ctx,
    d,
    command,
    label: `simctl status_bar ${d.action ?? 'override'} ${d.udid ?? 'booted'}`,
  });
}
