import type { ResignStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { splitAdditionalArgs } from './_args';
import { execMaybeRemote, shellQuote } from './_exec';

// `fastlane sigh resign` re-codesigns an existing .ipa / .app. The destination
// keychain must already be unlocked, otherwise codesign will block on the
// system UI prompt — chain a `keychainUnlock` step ahead of this one.

// Pure argv builder — exported for the test suite. Returns a fully
// shell-quoted string. Every text field is shell-quoted because at least one
// of them (signingIdentity) reliably contains spaces and parentheses.
export function buildResignCommand(d: Partial<ResignStepData>): string {
  const ipa = d.ipaPath?.trim();
  if (!ipa || ipa.length === 0) throw new Error('resign: missing "ipaPath"');
  const identity = d.signingIdentity?.trim();
  if (!identity || identity.length === 0) {
    throw new Error('resign: missing "signingIdentity"');
  }
  const profile = d.provisioningProfile?.trim();
  if (!profile || profile.length === 0) {
    throw new Error('resign: missing "provisioningProfile"');
  }

  const parts: string[] = ['fastlane', 'sigh', 'resign'];

  const flag = (name: string, value: string) => {
    parts.push(name, shellQuote(value));
  };

  flag('--signing_identity', identity);
  flag('--provisioning_profile', profile);

  if (d.bundleId && d.bundleId.trim().length > 0) flag('--bundle_id', d.bundleId.trim());
  if (d.displayName && d.displayName.trim().length > 0) {
    flag('--display_name', d.displayName.trim());
  }
  if (d.entitlements && d.entitlements.trim().length > 0) {
    flag('--entitlements', d.entitlements.trim());
  }
  if (d.keychainPath && d.keychainPath.trim().length > 0) {
    flag('--keychain_path', d.keychainPath.trim());
  }

  parts.push(...splitAdditionalArgs(d.additionalArgs));

  // ipa path is the trailing positional — fastlane sigh resign treats the
  // first non-flag arg as the bundle to re-sign.
  parts.push(shellQuote(ipa));

  return parts.join(' ');
}

// Truncate the identity for the log label so the team ID inside the parens
// doesn't get echoed verbatim before the command runs.
function redactIdentity(identity: string): string {
  const trimmed = identity.trim();
  if (trimmed.length <= 12) return `${trimmed.slice(0, 4)}...`;
  return `${trimmed.slice(0, 12)}...`;
}

export async function runResign(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<ResignStepData>;
  const command = buildResignCommand(d);
  const ipa = d.ipaPath?.trim() ?? '';
  const identityHint = redactIdentity(d.signingIdentity?.trim() ?? '');
  await execMaybeRemote({
    ctx,
    d,
    command,
    cwd: d.cwd && d.cwd.trim().length > 0 ? d.cwd : undefined,
    label: `fastlane sigh resign ${ipa} (identity: ${identityHint})`,
  });
}
