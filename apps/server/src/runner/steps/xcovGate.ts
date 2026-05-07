import type { XcovGateStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { execMaybeRemote, shellQuote } from './_exec';
import { pushWorkspaceOrProject, splitAdditionalArgs } from './_args';

export function buildXcovGateCommand(d: Partial<XcovGateStepData>): string {
  if (!d.scheme || d.scheme.trim().length === 0) {
    throw new Error('xcovGate: requires "scheme"');
  }

  const parts: string[] = ['xcov'];

  pushWorkspaceOrProject(parts, d, {
    workspaceFlag: '--workspace',
    projectFlag: '--project',
    requireOne: true,
    stepName: 'xcovGate',
  });

  parts.push('--scheme', shellQuote(d.scheme));

  // 0 is the sentinel "no gate" value per the field's UI contract — xcov
  // would actually fail on 0%, so we omit the flag entirely instead.
  if (typeof d.minimumCoveragePercentage === 'number' && d.minimumCoveragePercentage > 0) {
    parts.push('--minimum_coverage_percentage', String(d.minimumCoveragePercentage));
  }

  // Always emit output_directory — registry default 'xcov_report' surfaces
  // in the rendered command.
  const outDir = d.outputDirectory && d.outputDirectory.trim().length > 0
    ? d.outputDirectory
    : 'xcov_report';
  parts.push('--output_directory', shellQuote(outDir));

  if (d.includeTargets && d.includeTargets.trim().length > 0) {
    parts.push('--include_targets', shellQuote(d.includeTargets.trim()));
  }
  if (d.excludeTargets && d.excludeTargets.trim().length > 0) {
    parts.push('--exclude_targets', shellQuote(d.excludeTargets.trim()));
  }

  if (d.jsonReport === 'true') parts.push('--json_report');
  if (d.markdownReport === 'true') parts.push('--markdown_report');

  parts.push(...splitAdditionalArgs(d.additionalArgs));

  return parts.join(' ');
}

export async function runXcovGate(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<XcovGateStepData>;
  const command = buildXcovGateCommand(d);
  await execMaybeRemote({
    ctx,
    d,
    command,
    cwd: d.cwd && d.cwd.trim().length > 0 ? d.cwd : undefined,
    label: command,
  });
}
