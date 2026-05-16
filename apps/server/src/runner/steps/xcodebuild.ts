import { spawn } from 'node:child_process';
import type { XcodebuildStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { execMaybeRemote, isRemote, shellQuote } from './_exec';

// Pure argv-builder split out of the runner so it can be exercised by unit
// tests without spinning up a real xcodebuild — see xcodebuild.test.ts.
export function buildXcodebuildArgs(d: Partial<XcodebuildStepData>): string[] {
  const action = d.buildAction ?? 'build';
  const args: string[] = [];

  if (action === 'exportArchive') {
    // exportArchive doesn't take -workspace / -project / -scheme; it only
    // reads an existing .xcarchive and writes an .ipa into exportPath.
    if (!d.archivePath) throw new Error('xcodebuild exportArchive: missing "archivePath"');
    if (!d.exportPath) throw new Error('xcodebuild exportArchive: missing "exportPath"');
    if (!d.exportOptionsPlist) {
      throw new Error('xcodebuild exportArchive: missing "exportOptionsPlist"');
    }
    args.push('-exportArchive');
    args.push('-archivePath', d.archivePath);
    args.push('-exportPath', d.exportPath);
    args.push('-exportOptionsPlist', d.exportOptionsPlist);
  } else {
    if (!d.scheme) throw new Error('xcodebuild: missing "scheme"');
    if (!d.workspacePath && !d.projectPath) {
      throw new Error('xcodebuild: requires either "workspacePath" or "projectPath"');
    }
    if (d.workspacePath) args.push('-workspace', d.workspacePath);
    else if (d.projectPath) args.push('-project', d.projectPath);
    args.push('-scheme', d.scheme);
    if (d.configuration) args.push('-configuration', d.configuration);
    if (d.destination) args.push('-destination', d.destination);
    if (action === 'archive') {
      args.push('archive');
      if (d.archivePath) args.push('-archivePath', d.archivePath);
    } else {
      args.push(action);
    }
  }

  // Test retry / iteration modes (Xcode 13+). Only valid with buildAction=test.
  if (action === 'test' && d.testRetryMode && d.testRetryMode !== 'none') {
    const iterations = Math.min(Math.max(d.testIterations ?? 3, 2), 50);
    args.push('-test-iterations', String(iterations));
    if (d.testRetryMode === 'retry-on-failure') {
      args.push('-retry-tests-on-failure');
    } else if (d.testRetryMode === 'until-failure') {
      args.push('-run-tests-until-failure');
    }
    // 'repeat' is bare -test-iterations N with no additional flag.
  }

  if (d.additionalArgs && d.additionalArgs.trim().length > 0) {
    args.push(...d.additionalArgs.split(/\s+/).filter(Boolean));
  }

  return args;
}

// Resolve the prettifier value to a shell command suffix (e.g. " | xcpretty")
// or an empty string when no prettifier is requested. Centralised here so
// the local and remote code paths agree on the exact pipe syntax.
export function prettifierSuffix(p: XcodebuildStepData['prettifier']): string {
  if (!p || p === 'none') return '';
  if (p === 'xcpretty') return ' | xcpretty';
  if (p === 'xcbeautify') return ' | xcbeautify';
  return '';
}

export async function runXcodebuild(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<XcodebuildStepData>;
  const args = buildXcodebuildArgs(d);
  const suffix = prettifierSuffix(d.prettifier);

  if (isRemote(d) || suffix.length > 0) {
    // Either remote or we need a shell pipe for xcpretty / xcbeautify.
    // Both go through execMaybeRemote so the shell is wired up; locally
    // it runs via `sh -c` (set in _exec.ts) and the pipe works as expected.
    // PIPESTATUS-ish trick: prepend `set -o pipefail` so a non-zero
    // xcodebuild exit isn't masked by xcpretty's 0 exit.
    const inner = ['xcrun', 'xcodebuild', ...args.map(shellQuote)].join(' ');
    const command = suffix.length > 0
      ? `set -o pipefail; ${inner}${suffix}`
      : inner;
    await execMaybeRemote({
      ctx,
      d,
      command,
      label: `xcodebuild ${args.join(' ')}${suffix}`,
    });
    return;
  }

  // Local + no prettifier — keep the existing direct-spawn path so we get
  // clean ENOENT diagnostics ("must run on a macOS host") instead of a
  // generic shell error.
  ctx.log(`xcodebuild ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`);
  ctx.log(`cwd: ${ctx.project.path}`);

  await new Promise<void>((resolve, reject) => {
    const child = spawn('xcodebuild', args, {
      cwd: ctx.project.path,
      env: process.env,
    });
    ctx.attachProcess(child);
    child.on('error', (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        reject(new Error('xcodebuild not found — this step must run on a macOS host (use Remote SSH or set a saved Mac host on this step)'));
      } else {
        reject(err);
      }
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`xcodebuild exited with code ${code}`));
    });
  });
}
