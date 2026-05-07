import type { PeripheryScanStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { execMaybeRemote, shellQuote } from './_exec';

const VALID_FORMATS = new Set([
  'xcode',
  'json',
  'csv',
  'github-actions',
  'checkstyle',
]);

// Pure command builder. Returns the joined shell string ready for
// execMaybeRemote — exposed for the test suite.
export function buildPeripheryScanCommand(
  d: Partial<PeripheryScanStepData>,
): string {
  if (!d.workspacePath && !d.projectPath) {
    throw new Error('peripheryScan: requires either "workspacePath" or "projectPath"');
  }

  const parts: string[] = ['periphery', 'scan'];

  if (d.workspacePath) parts.push('--workspace', shellQuote(d.workspacePath));
  else if (d.projectPath) parts.push('--project', shellQuote(d.projectPath));

  // periphery accepts comma-separated lists directly — pass through as one
  // shell-quoted token so commas survive the shell.
  if (d.schemes && d.schemes.trim().length > 0) {
    parts.push('--schemes', shellQuote(d.schemes.trim()));
  }
  if (d.targets && d.targets.trim().length > 0) {
    parts.push('--targets', shellQuote(d.targets.trim()));
  }

  const format = d.format ?? 'xcode';
  if (!VALID_FORMATS.has(format)) {
    throw new Error(`peripheryScan: invalid format "${format}"`);
  }
  parts.push('--format', format);

  if (d.strict === 'true') parts.push('--strict');

  if (d.configFile && d.configFile.trim().length > 0) {
    parts.push('--config', shellQuote(d.configFile));
  }

  if (d.additionalArgs && d.additionalArgs.trim().length > 0) {
    for (const a of d.additionalArgs.split(/\s+/).filter(Boolean)) {
      parts.push(shellQuote(a));
    }
  }

  return parts.join(' ');
}

export async function runPeripheryScan(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<PeripheryScanStepData>;
  const command = buildPeripheryScanCommand(d);
  await execMaybeRemote({
    ctx,
    d,
    command,
    cwd: d.cwd && d.cwd.trim().length > 0 ? d.cwd : undefined,
    label: command,
  });
}
