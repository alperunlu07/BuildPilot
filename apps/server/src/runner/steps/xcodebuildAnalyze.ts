import type { XcodebuildAnalyzeStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { execMaybeRemote, shellQuote } from './_exec';
import { pushWorkspaceOrProject, splitAdditionalArgs } from './_args';

// Defense-in-depth: TS narrows configuration to 'Debug' | 'Release', but the
// API zod schema accepts node `data` as record<string, unknown>, so anything
// can reach the runner at runtime. Allowlist + shellQuote to block injection.
const VALID_CONFIGURATIONS = new Set(['Debug', 'Release']);

export function buildXcodebuildAnalyzeArgs(
  d: Partial<XcodebuildAnalyzeStepData>,
): string[] {
  if (!d.scheme || d.scheme.trim().length === 0) {
    throw new Error('xcodebuildAnalyze: missing "scheme"');
  }
  const configuration = d.configuration ?? 'Release';
  if (!VALID_CONFIGURATIONS.has(configuration)) {
    throw new Error(`xcodebuildAnalyze: invalid configuration "${configuration}"`);
  }

  const args: string[] = [];
  pushWorkspaceOrProject(args, d, {
    workspaceFlag: '-workspace',
    projectFlag: '-project',
    requireOne: true,
    stepName: 'xcodebuildAnalyze',
  });

  args.push('-scheme', shellQuote(d.scheme));
  args.push('-configuration', shellQuote(configuration));
  args.push('-destination', shellQuote(d.destination ?? 'generic/platform=iOS'));
  args.push(...splitAdditionalArgs(d.additionalArgs));
  args.push('analyze');
  return args;
}

export async function runXcodebuildAnalyze(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<XcodebuildAnalyzeStepData>;
  const args = buildXcodebuildAnalyzeArgs(d);
  const command = ['xcrun', 'xcodebuild', ...args].join(' ');
  await execMaybeRemote({
    ctx,
    d,
    command,
    cwd: d.cwd && d.cwd.trim().length > 0 ? d.cwd : undefined,
    label: command,
  });
}
