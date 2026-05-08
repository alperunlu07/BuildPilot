import type { SimctlScreenshotStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { splitAdditionalArgs } from './_args';
import { execMaybeRemote, shellQuote } from './_exec';

// `xcrun simctl io <udid> screenshot|recordVideo <output>`. Captures from
// the booted sim by default. Used for App Store screenshots, UI test
// failure diagnostics, and demo gif generation.
export function buildSimctlScreenshotCommand(d: Partial<SimctlScreenshotStepData>): string {
  const mode = d.mode ?? 'screenshot';
  if (mode !== 'screenshot' && mode !== 'recordVideo') {
    throw new Error(`simctlScreenshot: invalid mode "${mode}"`);
  }
  if (!d.outputPath || d.outputPath.trim().length === 0) {
    throw new Error('simctlScreenshot: missing "outputPath"');
  }
  const target = d.udid && d.udid.trim().length > 0 ? shellQuote(d.udid.trim()) : `'booted'`;
  const parts = ['xcrun', 'simctl', 'io', target];

  if (mode === 'screenshot') {
    parts.push('screenshot');
    if (d.type && d.type.trim().length > 0) parts.push('--type', shellQuote(d.type.trim()));
    if (d.display && d.display.trim().length > 0) parts.push('--display', shellQuote(d.display.trim()));
    if (d.mask && d.mask.trim().length > 0) parts.push('--mask', shellQuote(d.mask.trim()));
  } else {
    parts.push('recordVideo');
    if (d.codec && d.codec.trim().length > 0) parts.push('--codec', shellQuote(d.codec.trim()));
    if (d.display && d.display.trim().length > 0) parts.push('--display', shellQuote(d.display.trim()));
    if (d.mask && d.mask.trim().length > 0) parts.push('--mask', shellQuote(d.mask.trim()));
    if (d.force === 'true') parts.push('--force');
  }
  parts.push(shellQuote(d.outputPath.trim()));
  parts.push(...splitAdditionalArgs(d.additionalArgs));
  return parts.join(' ');
}

export async function runSimctlScreenshot(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<SimctlScreenshotStepData>;
  const command = buildSimctlScreenshotCommand(d);
  await execMaybeRemote({
    ctx,
    d,
    command,
    cwd: d.cwd && d.cwd.trim().length > 0 ? d.cwd : undefined,
    label: `simctl io ${d.mode ?? 'screenshot'} → ${d.outputPath}`,
  });
}
