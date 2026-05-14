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
  ctx.log(`$ ${d.command}`);
  ctx.log(`cwd: ${cwd}`);

  await new Promise<void>((resolve, reject) => {
    // shell:true so the command string is forwarded to the platform shell verbatim.
    // Without it, Node escapes inner double-quotes when building the Windows command
    // line, which cmd.exe doesn't understand — quoted paths silently fail to resolve.
    const child = spawn(d.command, [], { cwd, env: process.env, shell: true });
    ctx.attachProcess(child);
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`shell exited with code ${code}`));
    });
  });
}
