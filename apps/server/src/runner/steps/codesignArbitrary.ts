import type { CodesignArbitraryStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { splitAdditionalArgs } from './_args';
import { execMaybeRemote, shellQuote } from './_exec';

// `codesign --force --sign <identity> [--entitlements <plist>] <target>` —
// re-codesign individual extensions / dynamic libs with custom entitlements
// post-build. Useful for late-stage entitlement tweaks (e.g. swapping a
// dev-Push entitlement to production) without rebuilding from source.
export function buildCodesignCommand(d: Partial<CodesignArbitraryStepData>): string {
  if (!d.targetPath || d.targetPath.trim().length === 0) {
    throw new Error('codesignArbitrary: missing "targetPath"');
  }
  if (!d.identity || d.identity.trim().length === 0) {
    throw new Error('codesignArbitrary: missing "identity"');
  }
  const parts = ['codesign'];
  if (d.force !== 'false') parts.push('--force');
  if (d.preserveMetadata && d.preserveMetadata.trim().length > 0) {
    parts.push('--preserve-metadata=' + shellQuote(d.preserveMetadata.trim()));
  }
  if (d.timestamp !== 'none') {
    if (d.timestamp === 'true' || d.timestamp === '' || d.timestamp === undefined) {
      parts.push('--timestamp');
    } else {
      parts.push('--timestamp=' + shellQuote(d.timestamp));
    }
  } else {
    parts.push('--timestamp=none');
  }
  if (d.options && d.options.trim().length > 0) {
    parts.push('--options', shellQuote(d.options.trim()));
  }
  parts.push('--sign', shellQuote(d.identity.trim()));
  if (d.entitlementsPath && d.entitlementsPath.trim().length > 0) {
    parts.push('--entitlements', shellQuote(d.entitlementsPath.trim()));
  }
  if (d.requirements && d.requirements.trim().length > 0) {
    parts.push('--requirements', shellQuote(d.requirements.trim()));
  }
  parts.push(...splitAdditionalArgs(d.additionalArgs));
  parts.push(shellQuote(d.targetPath.trim()));
  return parts.join(' ');
}

export async function runCodesignArbitrary(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<CodesignArbitraryStepData>;
  const command = buildCodesignCommand(d);
  await execMaybeRemote({
    ctx,
    d,
    command,
    cwd: d.cwd && d.cwd.trim().length > 0 ? d.cwd : undefined,
    label: `codesign ${d.targetPath} (${d.identity?.slice(0, 40) ?? 'identity'})`,
  });
}
