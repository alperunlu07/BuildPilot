import type { PeripheryScanStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { execMaybeRemote, shellQuote } from './_exec';
import { pushWorkspaceOrProject, splitAdditionalArgs } from './_args';

const VALID_FORMATS = new Set([
  'xcode',
  'json',
  'csv',
  'github-actions',
  'checkstyle',
]);

export function buildPeripheryScanCommand(
  d: Partial<PeripheryScanStepData>,
): string {
  const parts: string[] = ['periphery', 'scan'];

  pushWorkspaceOrProject(parts, d, {
    workspaceFlag: '--workspace',
    projectFlag: '--project',
    requireOne: true,
    stepName: 'peripheryScan',
  });

  // Comma-separated lists pass through as one shell-quoted token so commas
  // survive the shell.
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

  parts.push(...splitAdditionalArgs(d.additionalArgs));

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
