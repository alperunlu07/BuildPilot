import type { PullStepData } from '@buildpilot/shared-types';
import { pull } from '../../git/operations';
import type { StepContext } from '../engine';

export async function runPull(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const remote = (data as Partial<PullStepData>).remote ?? 'origin';
  ctx.log(`git pull ${remote}\n`);
  const result = await pull(ctx.project.path, remote);
  ctx.log(`${result}\n`);
}
