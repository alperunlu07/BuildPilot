import type { SighStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { splitAdditionalArgs } from './_args';
import { execMaybeRemote, shellQuote } from './_exec';

// `fastlane sigh` — provisioning profile create / renew / repair / download.
// Complements the existing `provisioningProfileInstall` step (which only
// drops a pre-existing .mobileprovision into place); `sigh` fetches or
// regenerates the profile from the developer portal.
//
// Sub-actions map to fastlane sigh subcommands:
//   - download    → `sigh download` (fetch existing matching profile)
//   - renew       → `sigh renew` (regenerate via `sigh -f`)
//   - repair      → `sigh repair` (regenerate broken profiles in-place)
//   - manage      → `sigh manage` (list / nuke / cleanup)
const VALID_ACTIONS = new Set(['download', 'renew', 'repair', 'manage']);

export function buildSighCommand(d: Partial<SighStepData>): string {
  const action = d.action ?? 'download';
  if (!VALID_ACTIONS.has(action)) {
    throw new Error(`sigh: invalid action "${action}"`);
  }
  const parts: string[] = ['fastlane', 'sigh', action];

  if (d.appIdentifier && d.appIdentifier.trim().length > 0) {
    parts.push('--app_identifier', shellQuote(d.appIdentifier.trim()));
  }
  if (d.username && d.username.trim().length > 0) {
    parts.push('--username', shellQuote(d.username.trim()));
  }
  if (d.teamId && d.teamId.trim().length > 0) {
    parts.push('--team_id', shellQuote(d.teamId.trim()));
  }
  if (d.profileType && d.profileType.trim().length > 0) {
    // `sigh` uses a flag per profile type rather than a value: --adhoc /
    // --development / --developer_id (production is the default).
    if (d.profileType === 'adhoc') parts.push('--adhoc');
    else if (d.profileType === 'development') parts.push('--development');
    else if (d.profileType === 'developer_id') parts.push('--developer_id');
    else if (d.profileType !== 'appstore') {
      throw new Error(`sigh: invalid profileType "${d.profileType}"`);
    }
  }
  if (d.outputPath && d.outputPath.trim().length > 0) {
    parts.push('--output_path', shellQuote(d.outputPath.trim()));
  }
  if (d.force === 'true' && action !== 'manage') parts.push('--force');
  if (d.skipInstall === 'true') parts.push('--skip_install', 'true');
  if (d.platform && d.platform.trim().length > 0 && d.platform !== 'ios') {
    parts.push('--platform', shellQuote(d.platform.trim()));
  }
  parts.push(...splitAdditionalArgs(d.additionalArgs));
  return parts.join(' ');
}

export async function runSigh(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<SighStepData>;
  const command = buildSighCommand(d);
  await execMaybeRemote({
    ctx,
    d,
    command,
    cwd: d.cwd && d.cwd.trim().length > 0 ? d.cwd : undefined,
    label: `fastlane sigh ${d.action ?? 'download'} ${d.profileType ?? 'appstore'}${d.appIdentifier ? ` ${d.appIdentifier}` : ''}`,
  });
}
