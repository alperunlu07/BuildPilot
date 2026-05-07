import type { XcovGateStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { execMaybeRemote, shellQuote } from './_exec';

// Pure command builder. Returns the joined shell string ready for
// execMaybeRemote — exposed for the test suite.
export function buildXcovGateCommand(d: Partial<XcovGateStepData>): string {
  if (!d.workspacePath && !d.projectPath) {
    throw new Error('xcovGate: requires either "workspacePath" or "projectPath"');
  }
  if (!d.scheme || d.scheme.trim().length === 0) {
    throw new Error('xcovGate: requires "scheme"');
  }

  const parts: string[] = ['xcov'];

  if (d.workspacePath && d.workspacePath.trim().length > 0) {
    parts.push('--workspace', shellQuote(d.workspacePath));
  } else if (d.projectPath && d.projectPath.trim().length > 0) {
    parts.push('--project', shellQuote(d.projectPath));
  }

  parts.push('--scheme', shellQuote(d.scheme));

  // xcov uses underscored flag names. Only emit threshold when caller asked
  // for a non-zero gate so the noop default stays out of the rendered cmd.
  if (typeof d.minimumCoveragePercentage === 'number' && d.minimumCoveragePercentage > 0) {
    parts.push('--minimum_coverage_percentage', String(d.minimumCoveragePercentage));
  }

  // Emit output_directory unconditionally — registry default is 'xcov_report'
  // and the canonical sample includes it.
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

  if (d.additionalArgs && d.additionalArgs.trim().length > 0) {
    parts.push(...d.additionalArgs.split(/\s+/).filter(Boolean).map(shellQuote));
  }

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
