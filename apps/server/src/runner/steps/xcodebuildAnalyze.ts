import type { XcodebuildAnalyzeStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { execMaybeRemote, shellQuote } from './_exec';

// Pure argv-builder. Returns tokens ready for `args.join(' ')` — user-supplied
// paths/values are shell-quoted; flag names and the trailing `analyze` action
// are bare. Mirrors the xcodebuild step's argv shape so the test suite can
// assert against an exact command string.
export function buildXcodebuildAnalyzeArgs(
  d: Partial<XcodebuildAnalyzeStepData>,
): string[] {
  if (!d.workspacePath && !d.projectPath) {
    throw new Error('xcodebuildAnalyze: requires either "workspacePath" or "projectPath"');
  }
  if (!d.scheme || d.scheme.trim().length === 0) {
    throw new Error('xcodebuildAnalyze: missing "scheme"');
  }

  const args: string[] = [];
  if (d.workspacePath) args.push('-workspace', shellQuote(d.workspacePath));
  else if (d.projectPath) args.push('-project', shellQuote(d.projectPath));

  args.push('-scheme', shellQuote(d.scheme));

  const configuration = d.configuration ?? 'Release';
  args.push('-configuration', configuration);

  const destination = d.destination ?? 'generic/platform=iOS';
  args.push('-destination', shellQuote(destination));

  if (d.additionalArgs && d.additionalArgs.trim().length > 0) {
    for (const a of d.additionalArgs.split(/\s+/).filter(Boolean)) {
      args.push(shellQuote(a));
    }
  }

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
