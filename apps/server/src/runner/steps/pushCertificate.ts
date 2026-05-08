import type { PushCertificateStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { splitAdditionalArgs } from './_args';
import { execMaybeRemote, shellQuote } from './_exec';

// `fastlane pem` — generates / refreshes APNs production / dev / website push
// certificates. Drops the .pem (PKCS-8) and optionally the .p12 next to it.
//
// Renewal logic: pem checks the existing cert's expiry. With `force=true` it
// regenerates unconditionally. Default is "renew if it expires within
// 30 days" — matches the typical CI cadence of a daily renewal job.
export function buildPushCertificateCommand(d: Partial<PushCertificateStepData>): string {
  if (!d.appIdentifier || d.appIdentifier.trim().length === 0) {
    throw new Error('pushCertificate: missing "appIdentifier"');
  }
  const parts: string[] = ['fastlane', 'pem'];
  parts.push('--app_identifier', shellQuote(d.appIdentifier.trim()));
  if (d.username && d.username.trim().length > 0) {
    parts.push('--username', shellQuote(d.username.trim()));
  }
  if (d.teamId && d.teamId.trim().length > 0) {
    parts.push('--team_id', shellQuote(d.teamId.trim()));
  }
  if (d.development === 'true') parts.push('--development', 'true');
  if (d.generateP12 === 'false') parts.push('--generate_p12', 'false');
  if (d.password && d.password.trim().length > 0) {
    parts.push('--p12_password', shellQuote(d.password));
  }
  if (d.outputPath && d.outputPath.trim().length > 0) {
    parts.push('--output_path', shellQuote(d.outputPath.trim()));
  }
  if (d.force === 'true') parts.push('--force', 'true');
  if (d.activeDaysLimit && d.activeDaysLimit.toString().trim().length > 0) {
    parts.push('--active_days_limit', shellQuote(String(d.activeDaysLimit)));
  }
  parts.push(...splitAdditionalArgs(d.additionalArgs));
  return parts.join(' ');
}

export async function runPushCertificate(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<PushCertificateStepData>;
  const command = buildPushCertificateCommand(d);
  await execMaybeRemote({
    ctx,
    d,
    command,
    cwd: d.cwd && d.cwd.trim().length > 0 ? d.cwd : undefined,
    label: `fastlane pem ${d.appIdentifier} ${d.development === 'true' ? '(dev)' : '(prod)'}`,
  });
}
