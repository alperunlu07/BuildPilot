import type { SwiftFormatStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { execMaybeRemote, shellQuote } from './_exec';
import { splitMultilinePaths } from './_args';

export function buildSwiftFormatCommand(d: Partial<SwiftFormatStepData>): string {
  const mode = d.mode ?? 'lint';
  if (mode !== 'lint' && mode !== 'format') {
    throw new Error(`swiftFormat: invalid mode "${mode}"`);
  }
  const parts: string[] = ['swift-format', mode];
  // `format` rewrites in place; without -i it just prints to stdout, which is
  // never what the user wants from a build step.
  if (mode === 'format') parts.push('-i');

  if (d.configFile && d.configFile.trim().length > 0) {
    parts.push('--configuration', shellQuote(d.configFile));
  }

  // Default to recursive — matches the registry default and is the common
  // intent ("lint my repo").
  const recursive = d.recursive ?? 'true';
  if (recursive === 'true') parts.push('--recursive');

  if (d.parallel === 'true') parts.push('--parallel');

  parts.push(...splitMultilinePaths(d.paths));

  return parts.join(' ');
}

export async function runSwiftFormat(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<SwiftFormatStepData>;
  const command = buildSwiftFormatCommand(d);
  await execMaybeRemote({
    ctx,
    d,
    command,
    cwd: d.cwd && d.cwd.trim().length > 0 ? d.cwd : undefined,
    label: command,
  });
}
