import { spawn } from 'node:child_process';
import type { AdbPairStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { resolveAdbPath } from './_adb';

// Argv (without the pairing-code, which adb reads on stdin). Tested in
// isolation so we can verify the address validation + flag layout without
// shelling out to a real adb.
export function buildAdbPairArgs(d: Partial<AdbPairStepData>): string[] {
  const address = d.address?.trim();
  if (!address) throw new Error('adbPair: missing "address"');
  if (!address.includes(':')) {
    throw new Error(`adbPair: address "${address}" must be ip:port`);
  }
  if (!d.pairingCode || d.pairingCode.trim().length === 0) {
    throw new Error('adbPair: missing "pairingCode"');
  }
  if (!/^\d{6}$/.test(d.pairingCode.trim())) {
    throw new Error('adbPair: "pairingCode" must be the 6-digit number shown on-device');
  }
  return ['pair', address];
}

export async function runAdbPair(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<AdbPairStepData>;
  const args = buildAdbPairArgs(d);
  const adb = resolveAdbPath(d.adbPath);
  const code = d.pairingCode!.trim();
  ctx.log(`${adb} ${args.join(' ')} (pairing code redacted)`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(adb, args, { env: process.env });
    ctx.attachProcess(child);
    child.stdin?.end(`${code}\n`);
    child.on('error', (err) => {
      const ec = (err as NodeJS.ErrnoException).code;
      if (ec === 'ENOENT') {
        reject(new Error(`${adb} not found — install Android Platform Tools (or set adbPath)`));
      } else {
        reject(err);
      }
    });
    child.on('close', (rc) => {
      if (rc === 0) resolve();
      else reject(new Error(`adb exited with code ${rc}`));
    });
  });
}
