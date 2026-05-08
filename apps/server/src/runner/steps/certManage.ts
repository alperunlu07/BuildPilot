import type { CertManageStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { splitAdditionalArgs } from './_args';
import { execMaybeRemote, shellQuote } from './_exec';

// `fastlane cert` — signing certificate CRUD. Mostly a backstop when not
// using `fastlane match` (which is the recommended path for teams). Useful
// for one-off "create me a fresh certificate on this machine" needs.
export function buildCertManageCommand(d: Partial<CertManageStepData>): string {
  const parts: string[] = ['fastlane', 'cert'];
  if (d.development === 'true') parts.push('--development', 'true');
  if (d.appIdentifier && d.appIdentifier.trim().length > 0) {
    parts.push('--app_identifier', shellQuote(d.appIdentifier.trim()));
  }
  if (d.username && d.username.trim().length > 0) {
    parts.push('--username', shellQuote(d.username.trim()));
  }
  if (d.teamId && d.teamId.trim().length > 0) {
    parts.push('--team_id', shellQuote(d.teamId.trim()));
  }
  if (d.outputPath && d.outputPath.trim().length > 0) {
    parts.push('--output_path', shellQuote(d.outputPath.trim()));
  }
  if (d.keychainPath && d.keychainPath.trim().length > 0) {
    parts.push('--keychain_path', shellQuote(d.keychainPath.trim()));
  }
  if (d.keychainPassword && d.keychainPassword.length > 0) {
    parts.push('--keychain_password', shellQuote(d.keychainPassword));
  }
  if (d.platform && d.platform.trim().length > 0) {
    parts.push('--platform', shellQuote(d.platform.trim()));
  }
  if (d.force === 'true') parts.push('--force', 'true');
  parts.push(...splitAdditionalArgs(d.additionalArgs));
  return parts.join(' ');
}

export async function runCertManage(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<CertManageStepData>;
  const command = buildCertManageCommand(d);
  await execMaybeRemote({
    ctx,
    d,
    command,
    cwd: d.cwd && d.cwd.trim().length > 0 ? d.cwd : undefined,
    label: `fastlane cert ${d.development === 'true' ? '(dev)' : '(prod)'}`,
  });
}
