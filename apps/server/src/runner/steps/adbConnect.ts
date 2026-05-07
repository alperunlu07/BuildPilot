import type { AdbConnectStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { resolveAdbPath, runAdbStreaming } from './_adb';

export async function runAdbConnect(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<AdbConnectStepData>;
  const address = d.address?.trim();
  if (!address) throw new Error('adbConnect: missing "address"');
  // adb's own validation here would be opaque ("failed to connect to ''")
  // — fail clearly if the user didn't supply ip:port form.
  if (!address.includes(':')) {
    throw new Error(`adbConnect: address "${address}" must be ip:port (e.g. 192.168.1.100:5555)`);
  }
  const adb = resolveAdbPath(d.adbPath);
  // `adb connect` exits 0 even when the device refuses, printing
  // "failed to connect to <addr>" on stdout. We can't easily detect that
  // from the exit code alone — the install/launch step that follows will
  // surface a clearer "no devices/emulators found" error if pairing failed.
  await runAdbStreaming(ctx, adb, ['connect', address]);
}
