import type { FrameitStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { execMaybeRemote, shellQuote } from './_exec';
import { splitAdditionalArgs } from './_args';

// Defense-in-depth: TS narrows colorFlag to the literal union, but the API
// zod schema accepts step `data` as record<string, unknown>, so anything can
// reach the runner at runtime. Allowlist + map to a fixed flag string.
// (The flag strings themselves are hardcoded here, so they're injection-safe.)
type FrameitColor = NonNullable<FrameitStepData['colorFlag']>;
const VALID_COLORS = new Set<FrameitColor>(['none', 'silver', 'gold', 'rose-gold', 'space-gray']);

const COLOR_TO_FLAG: Record<Exclude<FrameitColor, 'none'>, string> = {
  silver: '--silver',
  gold: '--gold',
  'rose-gold': '--rose_gold',
  'space-gray': '--space_gray',
};

// Pure argv builder — exported for the test suite. Returns a fully
// shell-quoted string ready to be handed to execMaybeRemote.
export function buildFrameitCommand(d: Partial<FrameitStepData>): string {
  const parts: string[] = ['fastlane', 'frameit'];

  const color = (d.colorFlag ?? 'none') as FrameitColor;
  if (!VALID_COLORS.has(color)) {
    throw new Error(`frameit: invalid colorFlag "${color}"`);
  }
  if (color !== 'none') {
    parts.push(COLOR_TO_FLAG[color]);
  }

  if (d.force === 'true') parts.push('--force');
  if (d.useLegacyIphone5s === 'true') parts.push('--use_legacy_iphone5s');

  // usePlatform is technically a free-form string in our schema even though
  // the docs only list a few values — shellQuote it just in case.
  if (d.usePlatform && d.usePlatform.trim().length > 0) {
    parts.push('--use_platform', shellQuote(d.usePlatform.trim()));
  }

  parts.push(...splitAdditionalArgs(d.additionalArgs));

  // Trailing positional path; defaults to './screenshots' when blank so the
  // command line is self-documenting in logs.
  const path = d.pathToScreenshots && d.pathToScreenshots.trim().length > 0
    ? d.pathToScreenshots.trim()
    : './screenshots';
  parts.push(shellQuote(path));

  return parts.join(' ');
}

export async function runFrameit(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<FrameitStepData>;
  const command = buildFrameitCommand(d);
  await execMaybeRemote({
    ctx,
    d,
    command,
    cwd: d.cwd && d.cwd.trim().length > 0 ? d.cwd : undefined,
    label: command,
  });
}
