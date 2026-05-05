import type { CheckoutStepData } from '@buildpilot/shared-types';
import { checkout } from '../../git/operations';
import type { StepContext } from '../engine';

export async function runCheckout(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const branch = (data as Partial<CheckoutStepData>).branch;
  if (!branch) throw new Error('checkout: missing "branch"');
  ctx.log(`git checkout ${branch}\n`);
  await checkout(ctx.project.path, branch);
}
