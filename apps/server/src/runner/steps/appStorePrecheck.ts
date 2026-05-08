import type { AppStorePrecheckStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { splitAdditionalArgs } from './_args';
import { execMaybeRemote, shellQuote } from './_exec';

// `fastlane precheck` validates App Store metadata before submission — checks
// for placeholder copy, copyright issues, future-feature mentions, swear
// words, dead URLs. Used as a gate before `appStoreUpload` / `deliver`.
export function buildAppStorePrecheckCommand(d: Partial<AppStorePrecheckStepData>): string {
  if (!d.appIdentifier || d.appIdentifier.trim().length === 0) {
    throw new Error('appStorePrecheck: missing "appIdentifier"');
  }
  const parts: string[] = ['fastlane', 'precheck'];
  parts.push('--app_identifier', shellQuote(d.appIdentifier.trim()));
  if (d.username && d.username.trim().length > 0) {
    parts.push('--username', shellQuote(d.username.trim()));
  }
  if (d.teamId && d.teamId.trim().length > 0) {
    parts.push('--team_id', shellQuote(d.teamId.trim()));
  }
  if (d.includeInAppPurchases === 'true') parts.push('--include_in_app_purchases', 'true');
  if (d.defaultRule && d.defaultRule.trim().length > 0) {
    parts.push('--default_rule_level', shellQuote(d.defaultRule.trim()));
  }
  parts.push(...splitAdditionalArgs(d.additionalArgs));
  return parts.join(' ');
}

export async function runAppStorePrecheck(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<AppStorePrecheckStepData>;
  const command = buildAppStorePrecheckCommand(d);
  await execMaybeRemote({
    ctx,
    d,
    command,
    cwd: d.cwd && d.cwd.trim().length > 0 ? d.cwd : undefined,
    label: `fastlane precheck ${d.appIdentifier}`,
  });
}
