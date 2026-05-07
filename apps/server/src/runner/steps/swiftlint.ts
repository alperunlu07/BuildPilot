import type { SwiftlintStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { execMaybeRemote, shellQuote } from './_exec';
import { splitMultilinePaths } from './_args';

const VALID_REPORTERS = new Set([
  'xcode',
  'json',
  'junit',
  'markdown',
  'html',
  'emoji',
]);

export function buildSwiftlintCommand(d: Partial<SwiftlintStepData>): string {
  const mode = d.mode ?? 'lint';
  const parts: string[] = ['swiftlint'];

  // 'fix' uses `swiftlint --fix` with no subcommand; the others take the mode
  // name as the subcommand.
  if (mode === 'lint') parts.push('lint');
  else if (mode === 'analyze') parts.push('analyze');
  else if (mode === 'fix') parts.push('--fix');
  else throw new Error(`swiftlint: invalid mode "${mode}"`);

  if (d.configFile && d.configFile.trim().length > 0) {
    parts.push('--config', shellQuote(d.configFile));
  }

  const reporter = d.reporter ?? 'xcode';
  if (!VALID_REPORTERS.has(reporter)) {
    throw new Error(`swiftlint: invalid reporter "${reporter}"`);
  }
  // Default reporter is 'xcode' — only emit the flag when overridden so the
  // CLI's own default behaviour stays untouched in the common case.
  if (reporter !== 'xcode') {
    parts.push('--reporter', reporter);
  }

  if (d.strict === 'true') parts.push('--strict');
  if (d.quiet === 'true') parts.push('--quiet');

  parts.push(...splitMultilinePaths(d.paths));

  return parts.join(' ');
}

export async function runSwiftlint(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<SwiftlintStepData>;
  const command = buildSwiftlintCommand(d);
  await execMaybeRemote({
    ctx,
    d,
    command,
    cwd: d.cwd && d.cwd.trim().length > 0 ? d.cwd : undefined,
    label: command,
  });
}
