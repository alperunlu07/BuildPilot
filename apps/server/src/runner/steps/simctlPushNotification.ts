import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SimctlPushNotificationStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { execMaybeRemote, shellQuote } from './_exec';

// `xcrun simctl push <udid> [bundleId] <payload.apns>` — inject an APNs
// payload to test remote-notification handling without touching real APNs.
//
// We accept either an inline JSON payload (which we drop into a temp .apns
// file) or a payload path. Inline path is more useful in CI because the
// payload is checked into the pipeline definition next to the assertion.
export interface SimctlPushArgs {
  command: string;
  // Returned so the caller can clean up the temp file after the push.
  tmpFile?: string;
}

export async function buildSimctlPushCommand(
  d: Partial<SimctlPushNotificationStepData>,
): Promise<SimctlPushArgs> {
  const target = d.udid && d.udid.trim().length > 0 ? shellQuote(d.udid.trim()) : `'booted'`;
  const parts = ['xcrun', 'simctl', 'push', target];
  if (d.bundleId && d.bundleId.trim().length > 0) parts.push(shellQuote(d.bundleId.trim()));

  let payloadPath: string;
  let tmpFile: string | undefined;
  if (d.payloadPath && d.payloadPath.trim().length > 0) {
    payloadPath = d.payloadPath.trim();
  } else if (d.payloadJson && d.payloadJson.trim().length > 0) {
    // Validate JSON before writing.
    try {
      JSON.parse(d.payloadJson);
    } catch (err) {
      throw new Error(
        `simctlPushNotification: payloadJson is not valid JSON — ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    tmpFile = join(tmpdir(), `buildpilot-apns-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.apns`);
    await writeFile(tmpFile, d.payloadJson, 'utf-8');
    payloadPath = tmpFile;
  } else {
    throw new Error('simctlPushNotification: provide payloadJson or payloadPath');
  }
  parts.push(shellQuote(payloadPath));
  return { command: parts.join(' '), tmpFile };
}

export async function runSimctlPushNotification(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<SimctlPushNotificationStepData>;
  const { command, tmpFile } = await buildSimctlPushCommand(d);
  try {
    await execMaybeRemote({
      ctx,
      d,
      command,
      label: `simctl push ${d.udid ?? 'booted'}${d.bundleId ? ` ${d.bundleId}` : ''}`,
    });
  } finally {
    if (tmpFile) {
      // Best-effort cleanup; missing file is fine (we may have failed before
      // the push hit the sim).
      try {
        const { rm } = await import('node:fs/promises');
        await rm(tmpFile, { force: true });
      } catch {
        // ignore
      }
    }
  }
}
