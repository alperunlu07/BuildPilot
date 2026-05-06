import { spawn } from 'node:child_process';
import type { XcodebuildStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';

export async function runXcodebuild(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<XcodebuildStepData>;
  if (!d.scheme) throw new Error('xcodebuild: missing "scheme"');
  if (!d.workspacePath && !d.projectPath) {
    throw new Error('xcodebuild: requires either "workspacePath" or "projectPath"');
  }

  const args: string[] = [];
  if (d.workspacePath) args.push('-workspace', d.workspacePath);
  else if (d.projectPath) args.push('-project', d.projectPath);
  args.push('-scheme', d.scheme);
  if (d.configuration) args.push('-configuration', d.configuration);
  if (d.destination) args.push('-destination', d.destination);

  const action = d.buildAction ?? 'build';
  if (action === 'archive') {
    args.push('archive');
    if (d.archivePath) args.push('-archivePath', d.archivePath);
  } else {
    args.push(action);
  }

  if (d.additionalArgs && d.additionalArgs.trim().length > 0) {
    args.push(...d.additionalArgs.split(/\s+/).filter(Boolean));
  }

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
        reject(new Error('xcodebuild not found — this step must run on a macOS host (use Remote SSH for Mac agents)'));
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
