import { isAbsolute, join } from 'node:path';
import { promises as fs } from 'node:fs';
import type { TestflightUploadStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { execMaybeRemote, isRemote, shellQuote } from './_exec';

// Uploads an .ipa to App Store Connect / TestFlight via `xcrun altool`. Two
// auth methods are supported:
//
//   apiKey  — App Store Connect API key. Requires apiKeyId + apiIssuerId,
//             and the matching .p8 file already placed at
//             ~/.appstoreconnect/private_keys/AuthKey_<id>.p8 on the host
//             that runs this step. This is the recommended path.
//
//   appleId — username + app-specific password. Convenient for one-off
//             uploads; deprecated by Apple but still works at the time of
//             writing. The password is plaintext until the secrets vault
//             lands.
//
// Either way altool reads .ipa metadata, uploads via Apple's CDN, and exits
// non-zero on validation failure — which the runner surfaces as a step
// failure exactly like xcodebuild.
export async function runTestflightUpload(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<TestflightUploadStepData>;
  if (!d.ipaPath || d.ipaPath.trim().length === 0) {
    throw new Error('testflightUpload: missing "ipaPath"');
  }
  const platform = d.platform ?? 'ios';
  const authMethod = d.authMethod ?? 'apiKey';

  // For local runs, resolve and stat the file up front so we fail fast on a
  // typoed path. For remote runs we let altool's own "no such file" error
  // bubble up — the file lives on the Mac side, not here.
  let ipaPath = d.ipaPath;
  if (!isRemote(d)) {
    const abs = isAbsolute(ipaPath) ? ipaPath : join(ctx.project.path, ipaPath);
    const stat = await fs.stat(abs).catch(() => null);
    if (!stat || !stat.isFile()) throw new Error(`testflightUpload: not a file: ${abs}`);
    ipaPath = abs;
  }

  const args: string[] = ['xcrun', 'altool', '--upload-app', '-t', platform, '-f', shellQuote(ipaPath)];

  if (authMethod === 'apiKey') {
    if (!d.apiKeyId || !d.apiIssuerId) {
      throw new Error('testflightUpload: apiKeyId + apiIssuerId required for apiKey auth');
    }
    args.push('--apiKey', shellQuote(d.apiKeyId), '--apiIssuer', shellQuote(d.apiIssuerId));
  } else {
    if (!d.appleId || !d.appPassword) {
      throw new Error('testflightUpload: appleId + appPassword required for appleId auth');
    }
    args.push('-u', shellQuote(d.appleId), '-p', shellQuote(d.appPassword));
  }

  if (d.additionalArgs && d.additionalArgs.trim().length > 0) {
    args.push(...d.additionalArgs.split(/\s+/).filter(Boolean).map(shellQuote));
  }

  const command = args.join(' ');
  await execMaybeRemote({
    ctx,
    d,
    command,
    // Don't echo the full command — it has the password in it. Show a redacted version.
    label: `xcrun altool --upload-app -t ${platform} -f ${ipaPath} (${authMethod})`,
  });
}
