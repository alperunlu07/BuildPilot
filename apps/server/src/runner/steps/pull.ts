import type { PullStepData } from '@buildpilot/shared-types';
import { pull } from '../../git/operations';
import type { StepContext } from '../engine';

export async function runPull(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const remote = (data as Partial<PullStepData>).remote ?? 'origin';
  ctx.log(`git pull ${remote}`);
  const result = await pull(ctx.project.path, remote);
  // simple-git returns a JSON-y summary string; emit it as one stdout line.
  for (const line of result.split(/\r?\n/)) {
    if (line.length > 0) ctx.log(line, 'stdout');
  }
}
