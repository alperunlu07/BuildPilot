import type { SlatherCoverageStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { execMaybeRemote, shellQuote } from './_exec';

// Maps the friendly `format` enum to slather's mutually-exclusive CLI flag.
const FORMAT_FLAGS: Record<string, string> = {
  html: '--html',
  json: '--json',
  cobertura: '--cobertura-xml',
  simple: '--simple-output',
  sonarqube: '--sonarqube-xml',
};

// Pure command builder. Returns the joined shell string ready for
// execMaybeRemote — exposed for the test suite.
export function buildSlatherCoverageCommand(
  d: Partial<SlatherCoverageStepData>,
): string {
  if (!d.projectPath || d.projectPath.trim().length === 0) {
    throw new Error('slatherCoverage: requires "projectPath"');
  }

  const format = d.format ?? 'html';
  const formatFlag = FORMAT_FLAGS[format];
  if (!formatFlag) {
    throw new Error(`slatherCoverage: invalid format "${format}"`);
  }

  // `slather coverage` is the subcommand. Format flag goes before any other
  // option; project path is the trailing positional arg.
  const parts: string[] = ['slather', 'coverage', formatFlag];

  if (d.outputDirectory && d.outputDirectory.trim().length > 0) {
    parts.push('--output-directory', shellQuote(d.outputDirectory));
  }
  if (d.buildDirectory && d.buildDirectory.trim().length > 0) {
    parts.push('--build-directory', shellQuote(d.buildDirectory));
  }
  if (d.workspacePath && d.workspacePath.trim().length > 0) {
    parts.push('--workspace', shellQuote(d.workspacePath));
  }
  if (d.scheme && d.scheme.trim().length > 0) {
    parts.push('--scheme', shellQuote(d.scheme));
  }

  if (d.additionalArgs && d.additionalArgs.trim().length > 0) {
    parts.push(...d.additionalArgs.split(/\s+/).filter(Boolean).map(shellQuote));
  }

  parts.push(shellQuote(d.projectPath));

  return parts.join(' ');
}

export async function runSlatherCoverage(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<SlatherCoverageStepData>;
  const command = buildSlatherCoverageCommand(d);
  await execMaybeRemote({
    ctx,
    d,
    command,
    cwd: d.cwd && d.cwd.trim().length > 0 ? d.cwd : undefined,
    label: command,
  });
}
