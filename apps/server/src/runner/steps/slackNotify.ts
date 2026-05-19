import type { SlackNotifyStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { suppressForMatrixSummary } from './_matrixGuard';

export async function runSlackNotify(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<SlackNotifyStepData>;
  if (!d.webhookUrl) throw new Error('slackNotify: missing "webhookUrl"');
  if (!d.text) throw new Error('slackNotify: missing "text"');

  // Cluster 11.C — child of a matrix run with rolled-up notifications.
  // The parent build's notifyMatrix event will carry the summary; one
  // message per cell would just be noise.
  if (suppressForMatrixSummary(ctx)) {
    ctx.log('slackNotify: skipped (matrix child — parent will send rolled-up summary)');
    return;
  }

  ctx.log(`slack → ${maskUrl(d.webhookUrl)}`);
  ctx.log(d.text, 'stdout');

  const res = await fetch(d.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: d.text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`slack returned ${res.status}: ${body.slice(0, 200)}`);
  }
}

function maskUrl(u: string): string {
  // Keep host, redact the secret path that follows /services/
  return u.replace(/(\/services\/)[^?]+/, '$1<redacted>');
}
