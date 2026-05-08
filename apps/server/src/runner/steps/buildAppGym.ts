import type { BuildAppGymStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { splitAdditionalArgs } from './_args';
import { execMaybeRemote, shellQuote } from './_exec';

// `fastlane gym` (a.k.a. `build_app`) — archives + exports + xcpretty in one
// shot. Replaces the typical `xcodebuild archive → xcodebuild exportArchive`
// chain with a single step that handles ExportOptions.plist + xcpretty
// formatted output for free.
export function buildAppGymCommand(d: Partial<BuildAppGymStepData>): string {
  const parts: string[] = ['fastlane', 'gym'];
  if (d.workspacePath && d.workspacePath.trim().length > 0) {
    parts.push('--workspace', shellQuote(d.workspacePath.trim()));
  } else if (d.projectPath && d.projectPath.trim().length > 0) {
    parts.push('--project', shellQuote(d.projectPath.trim()));
  } else {
    throw new Error('buildAppGym: provide either workspacePath or projectPath');
  }
  if (!d.scheme || d.scheme.trim().length === 0) {
    throw new Error('buildAppGym: missing "scheme"');
  }
  parts.push('--scheme', shellQuote(d.scheme.trim()));

  if (d.configuration && d.configuration.trim().length > 0) {
    parts.push('--configuration', shellQuote(d.configuration.trim()));
  }
  if (d.exportMethod && d.exportMethod.trim().length > 0) {
    parts.push('--export_method', shellQuote(d.exportMethod.trim()));
  }
  if (d.exportOptionsPlist && d.exportOptionsPlist.trim().length > 0) {
    parts.push('--export_options', shellQuote(d.exportOptionsPlist.trim()));
  }
  if (d.outputDirectory && d.outputDirectory.trim().length > 0) {
    parts.push('--output_directory', shellQuote(d.outputDirectory.trim()));
  }
  if (d.outputName && d.outputName.trim().length > 0) {
    parts.push('--output_name', shellQuote(d.outputName.trim()));
  }
  if (d.includeBitcode === 'true') parts.push('--include_bitcode', 'true');
  if (d.includeSymbols === 'false') parts.push('--include_symbols', 'false');
  if (d.cleanBeforeBuild === 'true') parts.push('--clean', 'true');
  if (d.silent === 'true') parts.push('--silent', 'true');
  if (d.skipPackageIpa === 'true') parts.push('--skip_package_ipa', 'true');
  if (d.skipArchive === 'true') parts.push('--skip_archive', 'true');
  parts.push(...splitAdditionalArgs(d.additionalArgs));
  return parts.join(' ');
}

export async function runBuildAppGym(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<BuildAppGymStepData>;
  const command = buildAppGymCommand(d);
  await execMaybeRemote({
    ctx,
    d,
    command,
    cwd: d.cwd && d.cwd.trim().length > 0 ? d.cwd : undefined,
    label: `fastlane gym ${d.scheme}${d.exportMethod ? ` (${d.exportMethod})` : ''}`,
  });
}
