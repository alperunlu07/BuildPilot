import type { AppStoreUploadStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { splitAdditionalArgs } from './_args';
import { execMaybeRemote, shellQuote } from './_exec';

// `fastlane deliver` (a.k.a. `upload_to_app_store`) — uploads the .ipa, app
// metadata, screenshots, and optionally submits for review. Less ergonomic
// than the ASC API for individual operations but the only path that handles
// the screenshots + metadata bundle in one shot today.
export function buildAppStoreUploadCommand(d: Partial<AppStoreUploadStepData>): string {
  if (!d.appIdentifier || d.appIdentifier.trim().length === 0) {
    throw new Error('appStoreUpload: missing "appIdentifier"');
  }
  const parts: string[] = ['fastlane', 'deliver'];
  parts.push('--app_identifier', shellQuote(d.appIdentifier.trim()));
  if (d.ipaPath && d.ipaPath.trim().length > 0) {
    parts.push('--ipa', shellQuote(d.ipaPath.trim()));
  }
  if (d.metadataPath && d.metadataPath.trim().length > 0) {
    parts.push('--metadata_path', shellQuote(d.metadataPath.trim()));
  }
  if (d.screenshotsPath && d.screenshotsPath.trim().length > 0) {
    parts.push('--screenshots_path', shellQuote(d.screenshotsPath.trim()));
  }
  if (d.username && d.username.trim().length > 0) {
    parts.push('--username', shellQuote(d.username.trim()));
  }
  if (d.teamId && d.teamId.trim().length > 0) {
    parts.push('--team_id', shellQuote(d.teamId.trim()));
  }
  if (d.skipBinaryUpload === 'true') parts.push('--skip_binary_upload', 'true');
  if (d.skipMetadata === 'true') parts.push('--skip_metadata', 'true');
  if (d.skipScreenshots === 'true') parts.push('--skip_screenshots', 'true');
  if (d.submitForReview === 'true') parts.push('--submit_for_review', 'true');
  if (d.automaticRelease === 'true') parts.push('--automatic_release', 'true');
  if (d.force === 'true') parts.push('--force', 'true');
  parts.push(...splitAdditionalArgs(d.additionalArgs));
  return parts.join(' ');
}

export async function runAppStoreUpload(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<AppStoreUploadStepData>;
  const command = buildAppStoreUploadCommand(d);
  await execMaybeRemote({
    ctx,
    d,
    command,
    cwd: d.cwd && d.cwd.trim().length > 0 ? d.cwd : undefined,
    label: `fastlane deliver ${d.appIdentifier}${d.submitForReview === 'true' ? ' (submitForReview)' : ''}`,
  });
}
