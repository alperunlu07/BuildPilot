import { spawn } from 'node:child_process';
import { join } from 'node:path';
import type { ShellStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';

export async function runShell(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<ShellStepData>;
  if (!d.command) throw new Error('shell: missing "command"');
  const cwd = d.cwd ? join(ctx.project.path, d.cwd) : ctx.project.path;
  ctx.log(`$ ${d.command}\n  (cwd: ${cwd})\n`);

  const isWindows = process.platform === 'win32';
  const shell = isWindows ? 'cmd.exe' : '/bin/sh';
  const args = isWindows ? ['/d', '/s', '/c', d.command] : ['-c', d.command];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(shell, args, { cwd, env: process.env });
    child.stdout.on('data', (chunk: Buffer) => ctx.log(chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => ctx.log(chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`shell exited with code ${code}`));
    });
  });
}
