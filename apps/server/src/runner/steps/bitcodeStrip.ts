import type { BitcodeStripStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { execMaybeRemote, shellQuote } from './_exec';

// `xcrun bitcode_strip <input> -r -o <output>` — strips bitcode segments
// from a Mach-O binary. Apple deprecated bitcode in Xcode 14, but some
// upstream binaries still ship with it; stripping reduces size by 30-40%
// and avoids App Store linker warnings on embedded frameworks.
export function buildBitcodeStripCommand(d: Partial<BitcodeStripStepData>): string {
  if (!d.inputPath || d.inputPath.trim().length === 0) {
    throw new Error('bitcodeStrip: missing "inputPath"');
  }
  const out = d.outputPath && d.outputPath.trim().length > 0 ? d.outputPath.trim() : d.inputPath.trim();
  const mode = d.mode ?? 'remove';
  const flag = mode === 'leave' ? '-l' : mode === 'markerOnly' ? '-m' : '-r';
  return `xcrun bitcode_strip ${flag} ${shellQuote(d.inputPath.trim())} -o ${shellQuote(out)}`;
}

export async function runBitcodeStrip(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<BitcodeStripStepData>;
  const command = buildBitcodeStripCommand(d);
  await execMaybeRemote({
    ctx,
    d,
    command,
    label: `bitcode_strip ${d.mode ?? 'remove'} ${d.inputPath}`,
  });
}
