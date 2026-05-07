import type { SwiftPackageResolveStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { execMaybeRemote, shellQuote } from './_exec';

// Pure builder for the test suite. xcodebuild's -resolvePackageDependencies
// flag forces SPM to fetch + resolve every package referenced in the
// workspace/project, populating the SourcePackages cache so the next
// xcodebuild invocation starts already-resolved.
export function buildSwiftPackageResolveArgs(
  d: Partial<SwiftPackageResolveStepData>,
): string[] {
  if (!d.workspacePath && !d.projectPath) {
    throw new Error('swiftPackageResolve: requires workspacePath or projectPath');
  }
  const args: string[] = ['xcrun', 'xcodebuild', '-resolvePackageDependencies'];
  if (d.workspacePath) args.push('-workspace', shellQuote(d.workspacePath));
  else if (d.projectPath) args.push('-project', shellQuote(d.projectPath));
  if (d.scheme && d.scheme.trim().length > 0) {
    args.push('-scheme', shellQuote(d.scheme));
  }
  if (d.clonedSourcePackagesDirPath && d.clonedSourcePackagesDirPath.trim().length > 0) {
    args.push('-clonedSourcePackagesDirPath', shellQuote(d.clonedSourcePackagesDirPath));
  }
  if (d.additionalArgs && d.additionalArgs.trim().length > 0) {
    args.push(...d.additionalArgs.split(/\s+/).filter(Boolean).map(shellQuote));
  }
  return args;
}

export async function runSwiftPackageResolve(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<SwiftPackageResolveStepData>;
  const args = buildSwiftPackageResolveArgs(d);
  await execMaybeRemote({
    ctx,
    d,
    command: args.join(' '),
    label: 'xcodebuild -resolvePackageDependencies',
  });
}
