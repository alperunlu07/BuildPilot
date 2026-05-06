import { spawn } from 'node:child_process';
import type { UnityBatchStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';

export async function runUnityBatch(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<UnityBatchStepData>;
  if (!d.unityPath) throw new Error('unityBatch: missing "unityPath"');
  if (!d.buildTarget) throw new Error('unityBatch: missing "buildTarget"');
  if (!d.executeMethod) throw new Error('unityBatch: missing "executeMethod"');

  const args: string[] = [
    '-batchmode',
    '-nographics',
    '-quit',
    '-projectPath',
    ctx.project.path,
    '-buildTarget',
    d.buildTarget,
    '-executeMethod',
    d.executeMethod,
    '-logFile',
    d.logPath && d.logPath.length > 0 ? d.logPath : '-',
  ];
  if (d.extraArgs) args.push(...d.extraArgs.split(/\s+/).filter(Boolean));

  ctx.log(`> "${d.unityPath}" ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(d.unityPath!, args, { env: process.env });
    ctx.attachProcess(child);
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Unity exited with code ${code}`));
    });
  });
}
