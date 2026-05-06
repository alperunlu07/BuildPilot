import type { StapleNotarizationStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { execMaybeRemote, shellQuote } from './_exec';

export function buildStapleArgs(d: Partial<StapleNotarizationStepData>): string[] {
  if (!d.bundlePath || d.bundlePath.trim().length === 0) {
    throw new Error('stapleNotarization: missing "bundlePath"');
  }
  return ['xcrun', 'stapler', 'staple', shellQuote(d.bundlePath)];
}

export async function runStapleNotarization(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<StapleNotarizationStepData>;
  const args = buildStapleArgs(d);
  await execMaybeRemote({
    ctx,
    d,
    command: args.join(' '),
    label: `xcrun stapler staple ${d.bundlePath}`,
  });
}
