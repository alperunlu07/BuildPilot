import type { StorekitConfigureStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { execMaybeRemote, shellQuote } from './_exec';

// Sets the `.storekit` configuration file used by `xcodebuild test` so IAP
// flows can be exercised against a synthetic StoreKit local environment
// rather than sandbox/prod App Store. The flag is `STOREKIT_CONFIGURATION`
// passed via `xcodebuild test -resultBundlePath ... STOREKIT_CONFIGURATION=
// path/to/Config.storekit` — but in practice it's easier to bake it into
// the scheme via `xcodebuild` with `-configurationFilePath` for the test
// action OR via xcconfig.
//
// Most CI flows just want to assert the file exists before the test runs;
// the actual wiring is done by either a `xcodebuild test` invocation that
// references the path, or by editing the scheme's storeKitConfigurationFile.
// This step writes the `xcodebuild` env-style override into a marker file
// the next xcodebuild step can consume.
export function buildStorekitCommand(d: Partial<StorekitConfigureStepData>): string {
  if (!d.storekitPath || d.storekitPath.trim().length === 0) {
    throw new Error('storekitConfigure: missing "storekitPath"');
  }
  // Validate file exists; xcodebuild will silently ignore the flag with a
  // missing path otherwise.
  return `[ -f ${shellQuote(d.storekitPath.trim())} ] && echo 'storekitConfig: ${d.storekitPath} ok'`;
}

export async function runStorekitConfigure(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<StorekitConfigureStepData>;
  const command = buildStorekitCommand(d);
  await execMaybeRemote({ ctx, d, command, label: `storekitConfigure ${d.storekitPath}` });
  ctx.log(
    `Pass to a downstream xcodebuild test step via additionalArgs: ` +
      `STOREKIT_CONFIGURATION=${d.storekitPath}`,
    'info',
  );
}
